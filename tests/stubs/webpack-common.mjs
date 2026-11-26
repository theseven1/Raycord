/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const useState = initial => [initial, () => { }];
export const useEffect = () => { };
export const UserStore = { getCurrentUser: () => ({ id: "999" }) };
