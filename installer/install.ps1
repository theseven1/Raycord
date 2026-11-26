# SPDX-License-Identifier: GPL-3.0-or-later
# Raycord installer for Windows: https://github.com/theseven1/Raycord

[CmdletBinding()]
param(
    [string]$VencordDir = $env:RAYCORD_VENCORD_DIR,
    [ValidateSet("auto", "stable", "ptb", "canary")]
    [string]$Branch = "auto",
    [switch]$Yes,
    [switch]$NoSchedule,
    [switch]$NoInject,
    [switch]$NoRestart,
    [switch]$Update,
    [switch]$Check,
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$env:GIT_TERMINAL_PROMPT = "0"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$RepoUrl = "https://github.com/theseven1/Raycord.git"
$ReleaseApi = "https://api.github.com/repos/theseven1/Raycord/releases/latest"
$ScriptUrls = @(
    "https://github.com/theseven1/Raycord/releases/latest/download/install.ps1",
    "https://raw.githubusercontent.com/theseven1/Raycord/main/installer/install.ps1"
)
$VencordUrl = "https://github.com/Vendicated/Vencord.git"
$NodeMajor = 22
$PluginName = "Raycord"
$TaskName = "Raycord Updater"

$DataDir = Join-Path $env:LOCALAPPDATA "Raycord"
$ToolsDir = Join-Path $DataDir "tools"
$ConfigFile = Join-Path $DataDir "installer.json"
$LogFile = Join-Path $DataDir "update.log"
$SelfCopy = Join-Path $DataDir "raycord.ps1"
$Quiet = [bool]$Update
if ($Update) { $Yes = $true }

if ($Help) {
    @"
Raycord installer

Usage: install.ps1 [options]

  -VencordDir PATH  Use the Vencord source folder at PATH (found or created automatically otherwise)
  -Branch NAME      Discord to patch: auto, stable, ptb or canary (default: auto)
  -Yes              Don't ask anything, use the defaults
  -NoSchedule       Don't set up automatic daily updates
  -NoInject         Build only, don't patch Discord
  -NoRestart        Don't restart Discord at the end
  -Update           Update Vencord and Raycord, rebuild if anything changed
  -Check            Show what was found and exit without changing anything
  -Uninstall        Remove Raycord and its automatic updates

One-line install:
  irm https://github.com/theseven1/Raycord/releases/latest/download/install.ps1 | iex
With options:
  & ([scriptblock]::Create((irm https://github.com/theseven1/Raycord/releases/latest/download/install.ps1))) -Yes
"@
    return
}

function Write-Log([string]$Message) {
    if ($Quiet) {
        New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
        Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" -Encoding utf8
    }
}
function Write-Step([string]$Message) { Write-Log $Message; if (-not $Quiet) { Write-Host ""; Write-Host "==> $Message" -ForegroundColor White } }
function Write-Info([string]$Message) { Write-Log $Message; if (-not $Quiet) { Write-Host "    $Message" } }
function Write-Ok([string]$Message) { Write-Log $Message; if (-not $Quiet) { Write-Host "    $Message" -ForegroundColor Green } }
function Write-Warn([string]$Message) { Write-Log "warning: $Message"; if (-not $Quiet) { Write-Host "    $Message" -ForegroundColor Yellow } }
function Stop-Install([string]$Message) {
    Write-Log "error: $Message"
    if (-not $Quiet) { Write-Host ""; Write-Host "Error: $Message" -ForegroundColor Red }
    throw $Message
}

function Confirm-Step([string]$Question, [bool]$Default = $true) {
    if ($Yes -or -not [Environment]::UserInteractive) { return $Default }
    $hint = if ($Default) { "[Y/n]" } else { "[y/N]" }
    try { $reply = Read-Host "    $Question $hint" } catch { return $Default }
    if ([string]::IsNullOrWhiteSpace($reply)) { return $Default }
    return $reply.Trim().ToLower().StartsWith("y")
}

function Invoke-Native {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $command = $args[0]
        $rest = @($args | Select-Object -Skip 1)
        & $command @rest
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Test-Command([string]$Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
    foreach ($dir in @((Join-Path $ToolsDir "node"), (Join-Path $ToolsDir "git\cmd"), (Join-Path $ToolsDir "pnpm"))) {
        if (Test-Path $dir) { $env:Path = "$dir;$env:Path" }
    }
}

function Get-Arch {
    switch ($env:PROCESSOR_ARCHITECTURE) {
        "ARM64" { "arm64" }
        "AMD64" { "x64" }
        default { if ([Environment]::Is64BitOperatingSystem) { "x64" } else { Stop-Install "32-bit Windows isn't supported." } }
    }
}

function Save-Config {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    @{ VencordDir = $script:VencordDir; PluginDir = $script:PluginDir; Branch = $Branch } | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding utf8
}

function Read-Config {
    if (Test-Path $ConfigFile) {
        try {
            $saved = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            if (-not $script:VencordDir -and $saved.VencordDir) { $script:VencordDir = $saved.VencordDir }
            if ($Branch -eq "auto" -and $saved.Branch) { $script:Branch = $saved.Branch }
        } catch { }
    }
}

function Install-Git {
    if (Test-Command git) { Write-Ok "Git $((Invoke-Native git --version) -replace '^git version ', '')"; return }
    Write-Info "Downloading Git (portable, no admin rights needed)"
    $release = Invoke-RestMethod "https://api.github.com/repos/git-for-windows/git/releases/latest" -Headers @{ "User-Agent" = "Raycord-Installer" }
    $pattern = if ((Get-Arch) -eq "arm64") { "^MinGit-[\d.]+-arm64\.zip$" } else { "^MinGit-[\d.]+-64-bit\.zip$" }
    $asset = $release.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
    if (-not $asset) { Stop-Install "Couldn't find a Git download. Install Git from https://git-scm.com and run this again." }
    $zip = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing
    $target = Join-Path $ToolsDir "git"
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Expand-Archive $zip -DestinationPath $target -Force
    Remove-Item $zip -Force
    Update-SessionPath
    if (-not (Test-Command git)) { Stop-Install "Git didn't install correctly." }
    Write-Ok "Git $((Invoke-Native git --version) -replace '^git version ', '') in $target"
}

function Get-NodeMajor {
    if (-not (Test-Command node)) { return 0 }
    try { return [int](Invoke-Native node -p "process.versions.node.split('.')[0]") } catch { return 0 }
}

function Install-Node {
    if ((Get-NodeMajor) -ge $NodeMajor) { Write-Ok "Node.js $(Invoke-Native node -v)"; return }
    $base = "https://nodejs.org/dist/latest-v$NodeMajor.x"
    $arch = Get-Arch
    $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
    $line = $sums | Where-Object { $_ -match "\s(node-v[\d.]+-win-$arch\.zip)$" } | Select-Object -First 1
    if (-not $line) { Stop-Install "No Node.js $NodeMajor build for Windows $arch." }
    $expected, $file = ($line.Trim() -split "\s+")
    Write-Info "Downloading $($file -replace '\.zip$', '') (portable, no admin rights needed)"
    $zip = Join-Path $env:TEMP $file
    Invoke-WebRequest "$base/$file" -OutFile $zip -UseBasicParsing
    if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $expected.ToUpper()) { Remove-Item $zip -Force; Stop-Install "The Node.js download didn't match its checksum." }
    $target = Join-Path $ToolsDir "node"
    $unpack = Join-Path $ToolsDir "node-unpack"
    foreach ($dir in @($target, $unpack)) { if (Test-Path $dir) { Remove-Item $dir -Recurse -Force } }
    Expand-Archive $zip -DestinationPath $unpack -Force
    Move-Item (Get-ChildItem $unpack | Select-Object -First 1).FullName $target
    Remove-Item $unpack -Recurse -Force
    Remove-Item $zip -Force
    Update-SessionPath
    if ((Get-NodeMajor) -lt $NodeMajor) { Stop-Install "Node.js didn't install correctly." }
    Write-Ok "Node.js $(Invoke-Native node -v) in $target"
}

$script:Pnpm = $null
function Initialize-Pnpm {
    $wanted = $null
    $package = Join-Path $script:VencordDir "package.json"
    if (Test-Path $package) {
        $match = [regex]::Match((Get-Content $package -Raw), '"packageManager":\s*"pnpm@([\d.]+)')
        if ($match.Success) { $wanted = $match.Groups[1].Value }
    }
    $local = Join-Path $ToolsDir "pnpm\pnpm.cmd"
    if (Test-Path $local) {
        $script:Pnpm = $local
    } elseif ($found = Get-Command pnpm.cmd, pnpm.exe -ErrorAction SilentlyContinue | Select-Object -First 1) {
        $script:Pnpm = $found.Source
    } else {
        $spec = if ($wanted) { "pnpm@$wanted" } else { "pnpm@latest" }
        Write-Info "Installing $spec"
        $npm = Join-Path (Split-Path (Get-Command node).Source) "npm.cmd"
        if (-not (Test-Path $npm)) { $npm = (Get-Command npm.cmd).Source }
        $code = Invoke-Logged $npm @("install", "-g", $spec, "--prefix", (Join-Path $ToolsDir "pnpm"), "--no-fund", "--no-audit") (Join-Path $DataDir "pnpm-install.log")
        if ($code -ne 0 -or -not (Test-Path $local)) { Stop-Install "pnpm couldn't be installed. See $(Join-Path $DataDir 'pnpm-install.log')." }
        $script:Pnpm = $local
    }
    $versionLog = Join-Path $DataDir "pnpm-version.log"
    Push-Location $env:TEMP
    try { Invoke-Logged $script:Pnpm @("--version") $versionLog | Out-Null } finally { Pop-Location }
    Write-Ok "pnpm $(Get-Content $versionLog -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\d+\.\d+' } | Select-Object -Last 1)"
}

function Invoke-Logged([string]$Exe, [string[]]$Arguments, [string]$LogPath) {
    New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
    $quoted = $Arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }
    $process = Start-Process -FilePath $Exe -ArgumentList $quoted -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $LogPath -RedirectStandardError "$LogPath.err"
    if (Test-Path "$LogPath.err") { Get-Content "$LogPath.err" | Add-Content $LogPath; Remove-Item "$LogPath.err" -Force }
    return $process.ExitCode
}

function Test-Vencord([string]$Dir) {
    if (-not $Dir) { return $false }
    $package = Join-Path $Dir "package.json"
    return (Test-Path $package) -and (Test-Path (Join-Path $Dir "src")) -and ((Get-Content $package -Raw) -match '"name":\s*"vencord"')
}

function Find-Vencord {
    if ($script:VencordDir) { $script:VencordDir = [IO.Path]::GetFullPath($script:VencordDir); return }
    $docs = [Environment]::GetFolderPath("MyDocuments")
    $candidates = @(
        (Get-Location).Path,
        (Join-Path $env:USERPROFILE "Vencord"),
        (Join-Path $docs "Vencord"),
        (Join-Path $docs "GitHub\Vencord"),
        (Join-Path $env:USERPROFILE "Documents\Vencord"),
        (Join-Path $env:USERPROFILE "Documents\GitHub\Vencord"),
        (Join-Path $env:USERPROFILE "Desktop\Vencord"),
        (Join-Path $env:USERPROFILE "Downloads\Vencord"),
        (Join-Path $env:USERPROFILE "source\repos\Vencord"),
        (Join-Path $env:USERPROFILE "Projects\Vencord"),
        "C:\Vencord"
    )
    foreach ($candidate in $candidates) {
        if (Test-Vencord $candidate) { $script:VencordDir = $candidate; return }
    }
    $script:VencordDir = Join-Path $env:USERPROFILE "Vencord"
}

function Get-Head([string]$Dir) {
    if (-not $Dir -or -not (Test-Path (Join-Path $Dir ".git"))) { return "none" }
    $head = Invoke-Native git -C $Dir rev-parse HEAD
    if ($head) { return $head } else { return "none" }
}

function Initialize-Vencord {
    if (Test-Vencord $script:VencordDir) {
        Write-Ok "Found Vencord in $($script:VencordDir)"
        if (Test-Path (Join-Path $script:VencordDir ".git")) {
            Invoke-Native git -C $script:VencordDir pull --ff-only -q
            if ($LASTEXITCODE -eq 0) { Write-Ok "Vencord is up to date" } else { Write-Warn "Couldn't update Vencord (offline, or it has local changes). Building the current version." }
        }
        return
    }
    if ((Test-Path $script:VencordDir) -and (Get-ChildItem $script:VencordDir -Force | Select-Object -First 1)) {
        Stop-Install "$($script:VencordDir) exists but isn't a Vencord source folder. Use -VencordDir to pick another folder."
    }
    Write-Info "Downloading Vencord to $($script:VencordDir)"
    Invoke-Native git clone -q --depth 1 $VencordUrl $script:VencordDir
    if ($LASTEXITCODE -ne 0) { Stop-Install "Downloading Vencord failed." }
    Write-Ok "Downloaded Vencord"
}

$script:PluginDir = $null
$script:PluginManaged = $false
function Find-Plugin {
    $script:PluginDir = $null
    $script:PluginManaged = $false
    $root = Join-Path $script:VencordDir "src\userplugins"
    if (-not (Test-Path $root)) { return }
    foreach ($dir in Get-ChildItem $root -Directory) {
        $index = Join-Path $dir.FullName "index.tsx"
        if ((Test-Path $index) -and ((Get-Content $index -Raw) -match "name:\s*`"$PluginName`"")) {
            $script:PluginDir = $dir.FullName
            if (Test-Path (Join-Path $dir.FullName ".git")) {
                $origin = Invoke-Native git -C $dir.FullName remote get-url origin
                $script:PluginManaged = $origin -match "theseven1/(Raycord|Rayward-Vencord-User-Plugin)"
            }
            return
        }
    }
}

function Get-LatestTag {
    try { return (Invoke-RestMethod $ReleaseApi -Headers @{ "User-Agent" = "Raycord-Installer" }).tag_name } catch { return $null }
}

function Switch-ToRelease([string]$Dir) {
    $tag = Get-LatestTag
    if ($tag) {
        Invoke-Native git -C $Dir fetch -q --depth 1 origin "refs/tags/${tag}:refs/tags/$tag"
        if ($LASTEXITCODE -ne 0) { Invoke-Native git -C $Dir fetch -q --tags origin 2>$null }
        Invoke-Native git -C $Dir -c advice.detachedHead=false checkout -q $tag
        if ($LASTEXITCODE -ne 0) { Stop-Install "Couldn't switch Raycord to $tag." }
        Write-Ok "Raycord $tag"
    } else {
        Invoke-Native git -C $Dir fetch -q --depth 1 origin main
        Invoke-Native git -C $Dir -c advice.detachedHead=false checkout -q FETCH_HEAD
        Write-Warn "Couldn't read the latest release, using the newest code instead."
    }
}

function Initialize-Plugin {
    Find-Plugin
    if ($script:PluginDir -and -not $script:PluginManaged) {
        Write-Ok "Found your own copy of Raycord in $($script:PluginDir)"
        Write-Info "Leaving it as it is. The installer only updates copies it installed."
        return
    }
    if (-not $script:PluginDir) {
        $script:PluginDir = Join-Path $script:VencordDir "src\userplugins\raycord"
        if (Test-Path $script:PluginDir) { Stop-Install "$($script:PluginDir) already exists but isn't Raycord. Move it away and try again." }
        Write-Info "Downloading Raycord"
        Invoke-Native git clone -q --depth 1 $RepoUrl $script:PluginDir
        if ($LASTEXITCODE -ne 0) { Stop-Install "Downloading Raycord failed." }
    }
    Switch-ToRelease $script:PluginDir
}

function Build-Vencord {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    $buildLog = Join-Path $DataDir "build.log"
    Push-Location $script:VencordDir
    try {
        Write-Info "Installing build dependencies (the first run takes a few minutes)"
        if ((Invoke-Logged $script:Pnpm @("install", "--frozen-lockfile") $buildLog) -ne 0) {
            if (-not $Quiet) { Get-Content $buildLog -Tail 20 | Write-Host }
            Stop-Install "Installing dependencies failed. The full log is in $buildLog"
        }
        Write-Info "Building Vencord with Raycord"
        if ((Invoke-Logged $script:Pnpm @("build") "$buildLog.build") -ne 0) {
            if (-not $Quiet) { Get-Content "$buildLog.build" -Tail 20 | Write-Host }
            Stop-Install "The build failed. The full log is in $buildLog.build"
        }
    } finally {
        Pop-Location
    }
    Write-Ok "Built"
}

function Invoke-Inject {
    Write-Info "Patching Discord ($Branch)"
    $logPath = Join-Path $DataDir "inject.log"
    $node = (Get-Command node).Source
    Push-Location $script:VencordDir
    try {
        Invoke-Logged $node @("scripts/runInstaller.mjs", "--", "-version") $logPath | Out-Null
        $bin = Join-Path $script:VencordDir "dist\Installer\VencordInstallerCli.exe"
        if (-not (Test-Path $bin)) { Write-Warn "Couldn't download Vencord's installer. Run 'pnpm inject' in $($script:VencordDir)."; return }
        $env:VENCORD_USER_DATA_DIR = $script:VencordDir
        $env:VENCORD_DEV_INSTALL = "1"
        try {
            $code = Invoke-Logged $bin @("-install", "-branch", $Branch) $logPath
        } finally {
            Remove-Item Env:VENCORD_USER_DATA_DIR, Env:VENCORD_DEV_INSTALL -ErrorAction SilentlyContinue
        }
        if ($code -eq 0) { Write-Ok "Discord is patched" } else { Write-Warn "Patching Discord failed, see $logPath. Run 'pnpm inject' in $($script:VencordDir)." }
    } finally {
        Pop-Location
    }
}

function Save-Self {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    if ($PSCommandPath -and (Test-Path $PSCommandPath) -and ($PSCommandPath -ne $SelfCopy)) {
        Copy-Item $PSCommandPath $SelfCopy -Force
        return
    }
    if ((Test-Path $SelfCopy) -and -not $Update) { return }
    foreach ($url in $ScriptUrls) {
        try {
            $text = (Invoke-WebRequest $url -UseBasicParsing).Content
            if ($text -match "Raycord installer") {
                Set-Content -Path "$SelfCopy.new" -Value $text -Encoding utf8
                Move-Item "$SelfCopy.new" $SelfCopy -Force
                return
            }
        } catch { }
    }
}

function Register-Updates {
    Save-Self
    if (-not (Test-Path $SelfCopy)) { Write-Warn "Couldn't save a copy of the installer, so automatic updates are off."; return }
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$SelfCopy`" -Update"
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    $daily = New-ScheduledTaskTrigger -Daily -At "12:00"
    $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $logon.Delay = "PT5M"
    try {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($logon, $daily) -Settings $settings -Principal $principal -Description "Keeps Raycord and Vencord up to date." -Force | Out-Null
        Write-Ok "Daily updates are on (Task Scheduler: $TaskName)"
    } catch {
        try {
            Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $daily -Settings $settings -Principal $principal -Description "Keeps Raycord and Vencord up to date." -Force | Out-Null
            Write-Ok "Daily updates are on (Task Scheduler: $TaskName)"
        } catch {
            Write-Warn "Couldn't turn on automatic updates: $($_.Exception.Message)"
        }
    }
}

function Unregister-Updates {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
}

function Restart-Discord {
    $apps = @{ "stable" = "Discord"; "ptb" = "DiscordPTB"; "canary" = "DiscordCanary" }
    $restarted = $false
    foreach ($entry in $apps.GetEnumerator()) {
        $process = Get-Process $entry.Value -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        if ($Branch -ne "auto" -and $Branch -ne $entry.Key) { continue }
        $process | Stop-Process -Force
        Start-Sleep -Seconds 2
        $updater = Join-Path $env:LOCALAPPDATA "$($entry.Value)\Update.exe"
        if (Test-Path $updater) {
            Start-Process $updater -ArgumentList "--processStart", "$($entry.Value).exe"
            $restarted = $true
        }
    }
    if ($restarted) { Write-Ok "Restarted Discord" } else { Write-Info "Start Discord to load Raycord." }
}

function Show-Banner { if (-not $Quiet) { Write-Host ""; Write-Host "Raycord installer (Windows)" -ForegroundColor White } }

function Invoke-Check {
    Read-Config; Update-SessionPath; Find-Vencord
    Show-Banner
    Write-Step "What's here"
    if (Test-Command git) { Write-Info "Git: $((Invoke-Native git --version) -replace '^git version ', '')" } else { Write-Info "Git: not installed" }
    if ((Get-NodeMajor) -gt 0) { Write-Info "Node.js: $(Invoke-Native node -v)" } else { Write-Info "Node.js: not installed" }
    if (Test-Vencord $script:VencordDir) {
        Write-Info "Vencord: $($script:VencordDir)"
        Find-Plugin
        if ($script:PluginDir -and $script:PluginManaged) { Write-Info "Raycord: $($script:PluginDir) (installed by this script)" }
        elseif ($script:PluginDir) { Write-Info "Raycord: $($script:PluginDir) (your own copy, left alone)" }
        else { Write-Info "Raycord: not installed" }
    } else {
        Write-Info "Vencord: not found, would download it to $($script:VencordDir)"
    }
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Write-Info "Automatic updates: on" } else { Write-Info "Automatic updates: off" }
}

function Invoke-Install {
    Read-Config
    Show-Banner
    Write-Step "Checking tools"
    Update-SessionPath
    Install-Git
    Install-Node

    Write-Step "Setting up Vencord"
    Find-Vencord
    Initialize-Vencord
    Initialize-Pnpm

    Write-Step "Setting up Raycord"
    Initialize-Plugin
    Save-Config

    Write-Step "Building"
    Build-Vencord

    if (-not $NoInject) {
        Write-Step "Patching Discord"
        Invoke-Inject
    }
    if (-not $NoSchedule) {
        Write-Step "Automatic updates"
        Register-Updates
    }
    if (-not $NoInject -and -not $NoRestart) {
        Write-Step "Finishing"
        if (Confirm-Step "Restart Discord now to load Raycord?") { Restart-Discord } else { Write-Info "Restart Discord when you're ready." }
    }

    Write-Host ""
    Write-Host "Done." -ForegroundColor Green -NoNewline
    Write-Host " Open Discord, go to Settings > Vencord > Plugins, enable Raycord and sign in with your Rayward API key."
    Write-Host ""
}

function Invoke-Update {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    $lock = Join-Path $DataDir "update.lock"
    if ((Test-Path $lock) -and ((Get-Item $lock).LastWriteTime -gt (Get-Date).AddHours(-2))) { Write-Log "Another update is running"; return }
    Set-Content $lock $PID
    try {
        if (Test-Path $LogFile) { Get-Content $LogFile -Tail 400 | Set-Content "$LogFile.tmp" -Encoding utf8; Move-Item "$LogFile.tmp" $LogFile -Force }
        Read-Config
        Update-SessionPath
        Write-Log "Update started"
        if (-not (Test-Vencord $script:VencordDir)) { Stop-Install "No Vencord folder saved. Run the installer again." }
        if (-not (Test-Command git)) { Install-Git }
        if ((Get-NodeMajor) -lt $NodeMajor) { Install-Node }

        $beforeVencord = Get-Head $script:VencordDir
        Initialize-Vencord
        Initialize-Pnpm
        Find-Plugin
        $beforePlugin = Get-Head $script:PluginDir
        if ($script:PluginDir -and $script:PluginManaged) { Switch-ToRelease $script:PluginDir }

        $unchanged = ($beforeVencord -eq (Get-Head $script:VencordDir)) -and ($beforePlugin -eq (Get-Head $script:PluginDir))
        if ($unchanged -and (Test-Path (Join-Path $script:VencordDir "dist\patcher.js"))) {
            Write-Log "Already up to date"
        } else {
            Build-Vencord
            Write-Log "Updated. Changes load the next time Discord starts."
        }
        Save-Self
    } finally {
        Remove-Item $lock -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-Uninstall {
    Read-Config
    Show-Banner
    Find-Vencord
    Write-Step "Removing Raycord"
    Unregister-Updates
    Write-Ok "Automatic updates are off"
    if (Test-Vencord $script:VencordDir) {
        Find-Plugin
        if ($script:PluginDir -and $script:PluginManaged) {
            Remove-Item $script:PluginDir -Recurse -Force
            Write-Ok "Removed $($script:PluginDir)"
            Update-SessionPath
            if ((Get-NodeMajor) -ge $NodeMajor) { Initialize-Pnpm; Build-Vencord }
        } elseif ($script:PluginDir) {
            Write-Info "Left your own copy in $($script:PluginDir)"
        }
    }
    if (Test-Path $DataDir) { Remove-Item $DataDir -Recurse -Force }
    Write-Ok "Removed $DataDir"
    Write-Info "Vencord itself stays. To remove it from Discord, run 'pnpm uninject' in $($script:VencordDir)."
}

try {
    if ($Check) { Invoke-Check }
    elseif ($Uninstall) { Invoke-Uninstall }
    elseif ($Update) { Invoke-Update }
    else { Invoke-Install }
} catch {
    if (-not $Quiet) { Write-Host "Installation stopped: $($_.Exception.Message)" -ForegroundColor Red }
    if ($PSCommandPath) { exit 1 }
}
