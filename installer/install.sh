#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Raycord installer for Linux and macOS: https://github.com/theseven1/Raycord

set -euo pipefail
export GIT_TERMINAL_PROMPT=0

REPO_URL="https://github.com/theseven1/Raycord.git"
RELEASE_API="https://api.github.com/repos/theseven1/Raycord/releases/latest"
SCRIPT_URLS=(
    "https://github.com/theseven1/Raycord/releases/latest/download/install.sh"
    "https://raw.githubusercontent.com/theseven1/Raycord/main/installer/install.sh"
)
VENCORD_URL="https://github.com/Vendicated/Vencord.git"
NODE_MAJOR=22
PLUGIN_NAME="Raycord"

if [[ "$(uname -s)" == "Darwin" ]]; then
    OS="darwin"
    DATA_DIR="$HOME/Library/Application Support/Raycord"
else
    OS="linux"
    DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/raycord"
fi
CONFIG_FILE="$DATA_DIR/installer.conf"
LOG_FILE="$DATA_DIR/update.log"
SELF_COPY="$DATA_DIR/raycord.sh"

VENCORD_DIR="${RAYCORD_VENCORD_DIR:-}"
BRANCH="auto"
MODE="install"
ASSUME_YES=0
SCHEDULE=1
INJECT=1
RESTART=1
QUIET=0
LOCK_DIR=""

usage() {
    cat <<'EOF'
Raycord installer

Usage: install.sh [options]

  --dir PATH        Use the Vencord source folder at PATH (found or created automatically otherwise,
                    or set RAYCORD_VENCORD_DIR)
  --branch NAME     Discord to patch: auto, stable, ptb or canary (default: auto)
  -y, --yes         Don't ask anything, use the defaults
  --no-schedule     Don't set up automatic daily updates
  --no-inject       Build only, don't patch Discord
  --no-restart      Don't restart Discord at the end
  --update          Update Vencord and Raycord, rebuild if anything changed
  --check           Show what was found and exit without changing anything
  --uninstall       Remove Raycord and its automatic updates
  -h, --help        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dir) VENCORD_DIR="${2:?--dir needs a path}"; shift ;;
        --branch) BRANCH="${2:?--branch needs a name}"; shift ;;
        -y|--yes) ASSUME_YES=1 ;;
        --no-schedule) SCHEDULE=0 ;;
        --no-inject) INJECT=0 ;;
        --no-restart) RESTART=0 ;;
        --update) MODE="update"; ASSUME_YES=1; QUIET=1 ;;
        --check) MODE="check" ;;
        --uninstall) MODE="uninstall" ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

if [[ -t 1 && $QUIET -eq 0 ]]; then
    BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
else
    BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi

log() {
    if [[ $QUIET -eq 1 ]]; then
        mkdir -p "$DATA_DIR"
        printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
    fi
}
step() { log "$*"; [[ $QUIET -eq 1 ]] || printf '\n%s==>%s %s%s\n' "$BOLD" "$RESET" "$BOLD" "$*$RESET"; }
info() { log "$*"; [[ $QUIET -eq 1 ]] || printf '    %s\n' "$*"; }
ok() { log "$*"; [[ $QUIET -eq 1 ]] || printf '    %s%s%s\n' "$GREEN" "$*" "$RESET"; }
warn() { log "warning: $*"; printf '    %s%s%s\n' "$YELLOW" "$*" "$RESET" >&2; }
die() { log "error: $*"; printf '\n%sError:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

ask() {
    local question="$1" default="${2:-y}" reply hint="[Y/n]"
    [[ "$default" == "n" ]] && hint="[y/N]"
    if [[ $ASSUME_YES -eq 1 ]] || ! { : < /dev/tty; } 2>/dev/null; then
        [[ "$default" == "y" ]]
        return
    fi
    printf '    %s %s ' "$question" "$hint" > /dev/tty
    read -r reply < /dev/tty || reply=""
    reply="${reply:-$default}"
    [[ "$reply" =~ ^[Yy] ]]
}

have() { command -v "$1" > /dev/null 2>&1; }

SUDO=""
if [[ $(id -u) -ne 0 ]] && have sudo; then SUDO="sudo"; fi

save_config() {
    mkdir -p "$DATA_DIR"
    {
        printf 'VENCORD_DIR=%q\n' "$VENCORD_DIR"
        printf 'PLUGIN_DIR=%q\n' "$PLUGIN_DIR"
        printf 'BRANCH=%q\n' "$BRANCH"
    } > "$CONFIG_FILE"
}

load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        local saved_dir="" saved_branch=""
        saved_dir="$(sed -n 's/^VENCORD_DIR=//p' "$CONFIG_FILE" | head -n1)"
        saved_branch="$(sed -n 's/^BRANCH=//p' "$CONFIG_FILE" | head -n1)"
        [[ -z "$VENCORD_DIR" && -n "$saved_dir" ]] && VENCORD_DIR="$(eval "printf '%s' $saved_dir")"
        [[ "$BRANCH" == "auto" && -n "$saved_branch" ]] && BRANCH="$(eval "printf '%s' $saved_branch")"
    fi
    return 0
}

use_local_tools() {
    [[ -d "$DATA_DIR/node/bin" ]] && export PATH="$DATA_DIR/node/bin:$PATH"
    [[ -d "$DATA_DIR/npm/bin" ]] && export PATH="$DATA_DIR/npm/bin:$PATH"
    return 0
}

fetch() {
    if have curl; then curl -fsSL --retry 2 "$1"
    elif have wget; then wget -qO- "$1"
    else die "Neither curl nor wget is installed."
    fi
}

download() {
    if have curl; then curl -fsSL --retry 2 -o "$2" "$1"
    else wget -qO "$2" "$1"
    fi
}

install_packages() {
    if [[ "$OS" == "darwin" ]]; then
        if have brew; then brew install "$@"; return; fi
        if [[ " $* " == *" git "* ]]; then
            xcode-select --install > /dev/null 2>&1 || true
            die "Install the Xcode command line tools from the window that just opened, then run this installer again."
        fi
        die "Install Homebrew (https://brew.sh) or $* yourself, then run this installer again."
    fi
    if have apt-get; then $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@"
    elif have dnf; then $SUDO dnf install -y -q "$@"
    elif have yum; then $SUDO yum install -y -q "$@"
    elif have pacman; then $SUDO pacman -S --needed --noconfirm "$@"
    elif have zypper; then $SUDO zypper --non-interactive install "$@"
    elif have apk; then $SUDO apk add "$@"
    elif have xbps-install; then $SUDO xbps-install -y "$@"
    else die "Couldn't find a package manager. Install $* yourself, then run this installer again."
    fi
}

ensure_basics() {
    local missing=()
    have curl || have wget || missing+=(curl)
    have tar || missing+=(tar)
    [[ "$OS" == "linux" ]] && ! have xz && missing+=(xz-utils)
    if [[ ${#missing[@]} -gt 0 ]]; then
        if have pacman || have dnf || have yum || have zypper || have apk; then missing=("${missing[@]/xz-utils/xz}"); fi
        info "Installing ${missing[*]}"
        install_packages "${missing[@]}"
    fi
}

ensure_git() {
    if have git; then ok "Git $(git --version | awk '{print $3}')"; return; fi
    info "Installing Git"
    install_packages git
    have git || die "Git couldn't be installed."
    ok "Git $(git --version | awk '{print $3}')"
}

node_major() {
    have node || { echo 0; return; }
    node -p 'process.versions.node.split(".")[0]' 2> /dev/null || echo 0
}

ensure_node() {
    if [[ $(node_major) -ge $NODE_MAJOR ]]; then ok "Node.js $(node -v)"; return; fi

    local arch
    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="armv7l" ;;
        ppc64le) arch="ppc64le" ;;
        s390x) arch="s390x" ;;
        *) die "Unsupported processor: $(uname -m). Install Node.js $NODE_MAJOR or newer yourself." ;;
    esac

    local base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
    local ext="tar.xz"; [[ "$OS" == "darwin" ]] && ext="tar.gz"
    local sums file tmp
    sums="$(fetch "$base/SHASUMS256.txt")" || die "Couldn't reach nodejs.org."
    file="$(printf '%s\n' "$sums" | awk '{print $2}' | grep -E "^node-v[0-9.]+-${OS}-${arch}\.${ext}$" | head -n1)"
    [[ -n "$file" ]] || die "No Node.js $NODE_MAJOR build for ${OS}-${arch}."

    info "Downloading ${file%.$ext} (no admin rights needed)"
    tmp="$(mktemp -d)"
    download "$base/$file" "$tmp/$file"
    local expected actual
    expected="$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f {print $1}')"
    if have sha256sum; then actual="$(sha256sum "$tmp/$file" | awk '{print $1}')"
    else actual="$(shasum -a 256 "$tmp/$file" | awk '{print $1}')"
    fi
    [[ "$expected" == "$actual" ]] || { rm -rf "$tmp"; die "The Node.js download didn't match its checksum."; }

    mkdir -p "$DATA_DIR"
    rm -rf "$DATA_DIR/node"
    mkdir -p "$DATA_DIR/node"
    tar -xf "$tmp/$file" -C "$DATA_DIR/node" --strip-components=1
    rm -rf "$tmp"
    use_local_tools
    [[ $(node_major) -ge $NODE_MAJOR ]] || die "Node.js didn't install correctly."
    ok "Node.js $(node -v) in $DATA_DIR/node"
}

PNPM=()
ensure_pnpm() {
    local wanted=""
    [[ -f "$VENCORD_DIR/package.json" ]] && wanted="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$VENCORD_DIR/package.json" | head -n1)"
    if [[ -x "$DATA_DIR/npm/bin/pnpm" ]]; then
        PNPM=("$DATA_DIR/npm/bin/pnpm")
    elif have pnpm && [[ "$(command -v pnpm)" != /mnt/* ]]; then
        PNPM=(pnpm)
    else
        local spec="pnpm@${wanted:-latest}"
        info "Installing $spec"
        mkdir -p "$DATA_DIR"
        npm install -g "$spec" --prefix "$DATA_DIR/npm" --no-fund --no-audit > "$DATA_DIR/pnpm-install.log" 2>&1             || die "pnpm couldn't be installed. See $DATA_DIR/pnpm-install.log"
        PNPM=("$DATA_DIR/npm/bin/pnpm")
    fi
    ok "pnpm $("${PNPM[@]}" --version 2> /dev/null | tail -n1)"
}

is_vencord() {
    [[ -f "$1/package.json" && -d "$1/src" ]] && grep -q '"name": *"vencord"' "$1/package.json"
}

find_vencord() {
    if [[ -n "$VENCORD_DIR" ]]; then
        VENCORD_DIR="${VENCORD_DIR/#\~/$HOME}"
        return
    fi
    local candidate
    for candidate in \
        "$PWD" "$HOME/Vencord" "$HOME/vencord" "$HOME/Documents/Vencord" \
        "$HOME/Documents/GitHub/Vencord" "$HOME/Projects/Vencord" "$HOME/projects/Vencord" \
        "$HOME/src/Vencord" "$HOME/code/Vencord" "$HOME/dev/Vencord" "$HOME/git/Vencord" "$HOME/Desktop/Vencord"; do
        if [[ -n "$candidate" ]] && is_vencord "$candidate"; then VENCORD_DIR="$candidate"; return; fi
    done
    VENCORD_DIR="$HOME/Vencord"
}

head_of() { git -C "$1" rev-parse HEAD 2> /dev/null || echo none; }

prepare_vencord() {
    if is_vencord "$VENCORD_DIR"; then
        ok "Found Vencord in $VENCORD_DIR"
        if [[ -d "$VENCORD_DIR/.git" ]]; then
            if git -C "$VENCORD_DIR" pull --ff-only -q 2> /dev/null; then ok "Vencord is up to date"
            else warn "Couldn't update Vencord (offline, or it has local changes). Building the current version."
            fi
        fi
        return
    fi
    if [[ -e "$VENCORD_DIR" && -n "$(ls -A "$VENCORD_DIR" 2> /dev/null)" ]]; then
        die "$VENCORD_DIR exists but isn't a Vencord source folder. Use --dir to pick another folder."
    fi
    info "Downloading Vencord to $VENCORD_DIR"
    git clone -q --depth 1 "$VENCORD_URL" "$VENCORD_DIR"
    ok "Downloaded Vencord"
}

PLUGIN_DIR=""
PLUGIN_MANAGED=0
find_plugin() {
    local index dir
    PLUGIN_DIR=""; PLUGIN_MANAGED=0
    for index in "$VENCORD_DIR"/src/userplugins/*/index.tsx; do
        [[ -f "$index" ]] || continue
        if grep -q "name: \"$PLUGIN_NAME\"" "$index"; then
            dir="$(dirname "$index")"
            PLUGIN_DIR="$dir"
            if [[ -d "$dir/.git" ]] && git -C "$dir" remote get-url origin 2> /dev/null | grep -qiE 'theseven1/(Raycord|Rayward-Vencord-User-Plugin)'; then
                PLUGIN_MANAGED=1
            fi
            return
        fi
    done
    return 0
}

latest_tag() {
    fetch "$RELEASE_API" 2> /dev/null | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1
}

checkout_release() {
    local dir="$1" tag
    tag="$(latest_tag || true)"
    if [[ -n "$tag" ]]; then
        git -C "$dir" fetch -q --depth 1 origin "refs/tags/$tag:refs/tags/$tag" 2> /dev/null || git -C "$dir" fetch -q --tags origin
        git -C "$dir" -c advice.detachedHead=false checkout -q "$tag"
        ok "Raycord $tag"
    else
        git -C "$dir" fetch -q --depth 1 origin main && git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
        warn "Couldn't read the latest release, using the newest code instead."
    fi
}

prepare_plugin() {
    find_plugin
    if [[ -n "$PLUGIN_DIR" && $PLUGIN_MANAGED -eq 0 ]]; then
        ok "Found your own copy of Raycord in $PLUGIN_DIR"
        info "Leaving it as it is. The installer only updates copies it installed."
        return
    fi
    if [[ -z "$PLUGIN_DIR" ]]; then
        PLUGIN_DIR="$VENCORD_DIR/src/userplugins/raycord"
        [[ -e "$PLUGIN_DIR" ]] && die "$PLUGIN_DIR already exists but isn't Raycord. Move it away and try again."
        info "Downloading Raycord"
        mkdir -p "$VENCORD_DIR/src/userplugins"
        git clone -q --depth 1 "$REPO_URL" "$PLUGIN_DIR"
    fi
    checkout_release "$PLUGIN_DIR"
}

build_vencord() {
    mkdir -p "$DATA_DIR"
    local build_log="$DATA_DIR/build.log"
    info "Installing build dependencies (the first run takes a few minutes)"
    if ! (cd "$VENCORD_DIR" && "${PNPM[@]}" install --frozen-lockfile) > "$build_log" 2>&1; then
        tail -n 20 "$build_log" >&2
        die "Installing dependencies failed. The full log is in $build_log"
    fi
    info "Building Vencord with Raycord"
    if ! (cd "$VENCORD_DIR" && "${PNPM[@]}" build) >> "$build_log" 2>&1; then
        tail -n 20 "$build_log" >&2
        die "The build failed. The full log is in $build_log"
    fi
    ok "Built"
}

installer_bin() {
    if [[ "$OS" == "darwin" ]]; then echo "$VENCORD_DIR/dist/Installer/VencordInstallerCli-darwin"
    else echo "$VENCORD_DIR/dist/Installer/VencordInstallerCli-linux"
    fi
}

inject_discord() {
    info "Patching Discord ($BRANCH)"
    (cd "$VENCORD_DIR" && node scripts/runInstaller.mjs -- -version > /dev/null 2>&1) || true
    local bin; bin="$(installer_bin)"
    [[ -x "$bin" ]] || { warn "Couldn't download Vencord's installer. Run '${PNPM[*]} inject' in $VENCORD_DIR."; return; }
    if VENCORD_USER_DATA_DIR="$VENCORD_DIR" VENCORD_DEV_INSTALL=1 "$bin" -install -branch "$BRANCH" > "$DATA_DIR/inject.log" 2>&1; then
        ok "Discord is patched"
    elif [[ -n "$SUDO" ]]; then
        info "Discord is installed system-wide, so this needs your password"
        if $SUDO env VENCORD_USER_DATA_DIR="$VENCORD_DIR" VENCORD_DEV_INSTALL=1 "$bin" -install -branch "$BRANCH"; then ok "Discord is patched"
        else warn "Patching Discord failed. Run '${PNPM[*]} inject' in $VENCORD_DIR."
        fi
    else
        warn "Patching Discord failed, see $DATA_DIR/inject.log. Run '${PNPM[*]} inject' in $VENCORD_DIR."
    fi
}

save_self() {
    mkdir -p "$DATA_DIR"
    local src="${BASH_SOURCE[0]:-}"
    if [[ -n "$src" && -f "$src" && "$src" != "$SELF_COPY" ]]; then
        cp "$src" "$SELF_COPY"
    elif [[ ! -f "$SELF_COPY" || "$MODE" == "update" ]]; then
        local url tmp="$SELF_COPY.new"
        for url in "${SCRIPT_URLS[@]}"; do
            if download "$url" "$tmp" 2> /dev/null && head -n1 "$tmp" | grep -q '^#!'; then mv "$tmp" "$SELF_COPY"; break; fi
        done
        rm -f "$tmp"
    fi
    [[ -f "$SELF_COPY" ]] && chmod +x "$SELF_COPY"
    return 0
}

schedule_updates() {
    save_self
    [[ -f "$SELF_COPY" ]] || { warn "Couldn't save a copy of the installer, so automatic updates are off."; return; }
    local runner="$SELF_COPY"

    if [[ "$OS" == "darwin" ]]; then
        local plist="$HOME/Library/LaunchAgents/org.raycord.updater.plist"
        mkdir -p "$(dirname "$plist")"
        cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>org.raycord.updater</string>
    <key>ProgramArguments</key><array><string>/bin/bash</string><string>$runner</string><string>--update</string></array>
    <key>RunAtLoad</key><true/>
    <key>StartInterval</key><integer>86400</integer>
    <key>LowPriorityIO</key><true/>
</dict>
</plist>
EOF
        launchctl unload "$plist" 2> /dev/null || true
        launchctl load -w "$plist" 2> /dev/null && ok "Daily updates are on (launchd)" || warn "Couldn't turn on automatic updates."
        return
    fi

    if have systemctl && systemctl --user show-environment > /dev/null 2>&1; then
        local unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
        mkdir -p "$unit_dir"
        cat > "$unit_dir/raycord-update.service" <<EOF
[Unit]
Description=Update Raycord and Vencord
After=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash "$runner" --update
Nice=10
EOF
        cat > "$unit_dir/raycord-update.timer" <<EOF
[Unit]
Description=Update Raycord and Vencord daily

[Timer]
OnBootSec=5min
OnUnitActiveSec=1d
Persistent=true

[Install]
WantedBy=timers.target
EOF
        systemctl --user daemon-reload
        systemctl --user enable --now raycord-update.timer > /dev/null 2>&1 && { ok "Daily updates are on (systemd timer)"; return; }
    fi

    if have crontab; then
        local line="@daily /bin/bash \"$runner\" --update"
        { crontab -l 2> /dev/null | grep -v 'raycord.sh" --update' || true; echo "$line"; echo "@reboot sleep 300 && /bin/bash \"$runner\" --update"; } | crontab -
        ok "Daily updates are on (cron)"
        return
    fi
    warn "Couldn't find a way to schedule updates. Run '$runner --update' now and then."
}

unschedule_updates() {
    if [[ "$OS" == "darwin" ]]; then
        local plist="$HOME/Library/LaunchAgents/org.raycord.updater.plist"
        [[ -f "$plist" ]] && { launchctl unload "$plist" 2> /dev/null || true; rm -f "$plist"; }
        return 0
    fi
    if have systemctl; then
        systemctl --user disable --now raycord-update.timer > /dev/null 2>&1 || true
        rm -f "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/raycord-update."{service,timer}
        systemctl --user daemon-reload > /dev/null 2>&1 || true
    fi
    if have crontab && crontab -l 2> /dev/null | grep -q 'raycord.sh" --update'; then
        crontab -l 2> /dev/null | grep -v 'raycord.sh" --update' | crontab -
    fi
    return 0
}

restart_discord() {
    local name launched=0
    if [[ "$OS" == "darwin" ]]; then
        for name in "Discord" "Discord PTB" "Discord Canary"; do
            if pgrep -xq "$name"; then
                osascript -e "quit app \"$name\"" > /dev/null 2>&1 || true
                sleep 2
                open -a "$name" && launched=1
            fi
        done
    else
        for name in Discord DiscordPTB DiscordCanary discord; do
            if pgrep -x "$name" > /dev/null 2>&1; then
                pkill -x "$name" || true
                launched=1
            fi
        done
        if [[ $launched -eq 1 ]]; then
            sleep 2
            if have discord; then nohup discord > /dev/null 2>&1 &
            elif have flatpak && flatpak info com.discordapp.Discord > /dev/null 2>&1; then nohup flatpak run com.discordapp.Discord > /dev/null 2>&1 &
            else launched=0
            fi
        fi
    fi
    if [[ $launched -eq 1 ]]; then ok "Restarted Discord"; else info "Start Discord to load Raycord."; fi
}

banner() {
    [[ $QUIET -eq 1 ]] && return
    printf '\n%sRaycord installer%s %s(%s)%s\n' "$BOLD" "$RESET" "$DIM" "$OS" "$RESET"
}

run_check() {
    load_config; use_local_tools; find_vencord
    banner
    step "What's here"
    have git && info "Git: $(git --version | awk '{print $3}')" || info "Git: not installed"
    [[ $(node_major) -gt 0 ]] && info "Node.js: $(node -v)" || info "Node.js: not installed"
    if is_vencord "$VENCORD_DIR"; then
        info "Vencord: $VENCORD_DIR"
        find_plugin
        if [[ -n "$PLUGIN_DIR" ]]; then
            [[ $PLUGIN_MANAGED -eq 1 ]] && info "Raycord: $PLUGIN_DIR (installed by this script)" || info "Raycord: $PLUGIN_DIR (your own copy, left alone)"
        else
            info "Raycord: not installed"
        fi
    else
        info "Vencord: not found, would download it to $VENCORD_DIR"
    fi
    [[ -f "$CONFIG_FILE" ]] && info "Settings: $CONFIG_FILE"
    return 0
}

run_install() {
    load_config
    banner
    step "Checking tools"
    ensure_basics
    ensure_git
    use_local_tools
    ensure_node

    step "Setting up Vencord"
    find_vencord
    prepare_vencord
    ensure_pnpm

    step "Setting up Raycord"
    prepare_plugin
    save_config

    step "Building"
    build_vencord

    if [[ $INJECT -eq 1 ]]; then
        step "Patching Discord"
        mkdir -p "$DATA_DIR"
        inject_discord
    fi

    if [[ $SCHEDULE -eq 1 ]]; then
        step "Automatic updates"
        schedule_updates
    fi

    if [[ $RESTART -eq 1 && $INJECT -eq 1 ]]; then
        step "Finishing"
        if ask "Restart Discord now to load Raycord?" y; then restart_discord; else info "Restart Discord when you're ready."; fi
    fi

    printf '\n%sDone.%s Open Discord, go to %sSettings > Vencord > Plugins%s, enable %sRaycord%s and sign in with your Rayward API key.\n\n' \
        "$GREEN$BOLD" "$RESET" "$BOLD" "$RESET" "$BOLD" "$RESET"
}

run_update() {
    mkdir -p "$DATA_DIR"
    LOCK_DIR="$DATA_DIR/update.lock"
    if ! mkdir "$LOCK_DIR" 2> /dev/null; then
        if [[ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +120 2> /dev/null)" ]]; then rm -rf "$LOCK_DIR"; mkdir "$LOCK_DIR"; else log "Another update is running"; exit 0; fi
    fi
    trap 'rm -rf "$LOCK_DIR"' EXIT
    [[ -f "$LOG_FILE" ]] && tail -n 400 "$LOG_FILE" > "$LOG_FILE.tmp" 2> /dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"

    load_config
    use_local_tools
    log "Update started"
    [[ -n "$VENCORD_DIR" ]] && is_vencord "$VENCORD_DIR" || die "No Vencord folder saved. Run the installer again."
    have git || die "Git is missing."
    [[ $(node_major) -ge $NODE_MAJOR ]] || ensure_node

    local before_v before_p
    before_v="$(head_of "$VENCORD_DIR")"
    prepare_vencord
    ensure_pnpm
    find_plugin
    before_p="$( [[ -n "$PLUGIN_DIR" ]] && head_of "$PLUGIN_DIR" || echo none)"
    if [[ -n "$PLUGIN_DIR" && $PLUGIN_MANAGED -eq 1 ]]; then checkout_release "$PLUGIN_DIR"; fi

    if [[ "$before_v" == "$(head_of "$VENCORD_DIR")" && "$before_p" == "$( [[ -n "$PLUGIN_DIR" ]] && head_of "$PLUGIN_DIR" || echo none)" && -f "$VENCORD_DIR/dist/patcher.js" ]]; then
        log "Already up to date"
    else
        build_vencord
        log "Updated. Changes load the next time Discord starts."
    fi
    save_self
}

run_uninstall() {
    load_config
    banner
    find_vencord
    step "Removing Raycord"
    unschedule_updates
    ok "Automatic updates are off"
    if is_vencord "$VENCORD_DIR"; then
        find_plugin
        if [[ -n "$PLUGIN_DIR" && $PLUGIN_MANAGED -eq 1 ]]; then
            rm -rf "$PLUGIN_DIR"
            ok "Removed $PLUGIN_DIR"
            use_local_tools
            if [[ $(node_major) -ge $NODE_MAJOR ]]; then ensure_pnpm; build_vencord; fi
        elif [[ -n "$PLUGIN_DIR" ]]; then
            info "Left your own copy in $PLUGIN_DIR"
        fi
    fi
    rm -rf "$DATA_DIR"
    ok "Removed $DATA_DIR"
    info "Vencord itself stays. To remove it from Discord, run 'pnpm uninject' in $VENCORD_DIR."
}

case "$MODE" in
    install) run_install ;;
    update) run_update ;;
    check) run_check ;;
    uninstall) run_uninstall ;;
esac
