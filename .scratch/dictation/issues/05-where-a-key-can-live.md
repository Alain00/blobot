Type: research
Status: resolved

# Where a key can live

## Question

Ticket 01's ADR puts the remote key in the OS keychain through Electron's `safeStorage`, with an
environment variable as the fallback. Establish the facts it needs, against Electron 44's docs:

1. `safeStorage.isEncryptionAvailable()` and `getSelectedStorageBackend()` per OS: Keychain on
   macOS, DPAPI on Windows, and on Linux `gnome_libsecret` / `kwallet*` / **`basic_text`** — when
   each is chosen, what `basic_text` actually is, and whether an app can refuse it.
2. What `safeStorage` encrypts and where the ciphertext must be kept (it returns a Buffer; the
   app stores it) — so the honest description is "encrypted with the OS keychain, stored in
   userData", not "in the keychain". Say which is true.
3. The macOS Keychain prompt behaviour for an unsigned / dev-built Electron app (the
   "electron wants to use your confidential information" dialog) and what changes when signed.
4. Env-var fallback: name, precedence when both exist, and what the app should say when the key
   came from the environment (it cannot be revoked in Settings).
5. What other local-first Electron apps do for API keys (two or three concrete examples with
   sources), as precedent for the ADR.

Record findings in `.scratch/dictation/research/05-key-storage.md`.

## Answer

Measured on Electron 44.0.0 (macOS, this machine) and read from Electron `44-x-y` and Chromium source. Full
findings, sources and the probe transcript: `.scratch/dictation/research/05-key-storage.md`.

1. **Backends.** macOS → Keychain, Windows → DPAPI, Linux → `SelectBackend`: the `--password-store` flag wins
   (`gnome-libsecret` / `kwallet` / `kwallet5` / `kwallet6` / `basic`), else `XDG_CURRENT_DESKTOP` then
   `DESKTOP_SESSION` map GNOME-family desktops to `gnome_libsecret`, KDE 4/5/6 to a `kwallet*`, and anything
   unrecognised (sway, i3, SSH, LXQt) to **`basic_text`** — even with gnome-keyring running. `basic_text` is
   AES-128-CBC under `PBKDF2("peanuts","saltysalt",1)` with an IV of sixteen spaces: obfuscation with the key in a
   public repo. **An app can refuse it, and Electron refuses it by default**: with `basic_text` selected,
   `isEncryptionAvailable()` is `false` and `encryptString` throws unless `setUsePlainTextEncryption(true)` was
   called — blobot never calls it. Trap: `getSelectedStorageBackend()` reports the *selected* backend, so a
   `gnome_libsecret` whose keyring fails to initialise falls back to the hardcoded key while still saying
   `gnome_libsecret`; `isEncryptionAvailable()` is the gate, the backend name is the explanation. Signal's
   `isEncryptionAvailable() && (!linux || backend !== 'basic_text')` is the shape to copy. `getSelectedStorageBackend`
   is **not a function** on macOS (observed) — guard by platform.
2. **What is encrypted, where.** `safeStorage` is an encryptor, not a store: it returns `v10`/`v11` + AES-CBC bytes
   and blobot files them. The keychain holds only a random password (item `<app.name> Safe Storage`); DPAPI holds
   nothing (the user's logon credential is the key). Honest sentence: **"encrypted with a key your OS keychain
   holds; the encrypted key is kept in blobot's data folder"** — never "in the keychain". Store it as one JSON beside
   `runtime-options.json` (base64 ciphertext + backend name at save time), never SQLite. Windows docs add "not
   protected from other apps running in the same userspace"; say so there.
3. **macOS prompt.** Observed on the ad-hoc-signed dev Electron: first use creates the item with **no dialog** and
   the same binary never asks (18 ms / 11 ms). The item's ACL grants `decrypt` to the **exact cdhash** of
   `Electron.app`, so every `electron` bump, rebuild, or re-sign triggers *"Electron" wants to use your confidential
   information stored in "… Safe Storage" in your keychain* (Allow Once / Always Allow / Deny; Deny disables
   encryption for the rest of the process). A Developer ID signature moves the partition to the team id, which is why
   Electron's docs say a signed app "behaves consistently" (issues #40236, #43233). In dev the item today would be
   named **`@blobot/desktop Safe Storage`**; `app.setName` fixes the label but also moves `userData`, so that is a
   build-ticket decision with a migration, not a one-liner.
4. **Env var.** `BLOBOT_<PROVIDER>_API_KEY` — never the provider's own `OPENAI_API_KEY`, which the user set for
   other tools. **Environment wins** over the stored key (gh's documented rule for `GH_TOKEN`); Settings names the
   source and the variable, offers **no remove control** (say "unset it in the shell that launched blobot"), notes a
   shadowed saved key, never echoes the value. Load-bearing: the variable must be **stripped from every spawned
   runtime's environment** (as `cursor/stdio.ts` already strips `CURSOR_API_KEY`) or "never shown to a runtime" is
   false. A Dock launch has no shell env, so on macOS this is a terminal-launch path; whether it is a fallback or
   always a door is ticket 01's, with the arguments for *always* recorded.
5. **Precedents.** Signal Desktop (SQLCipher key as hex in `config.json`, refuses `basic_text` explicitly);
   VS Code (all secrets via `safeStorage`; documents `--password-store`, calls `basic` "at best, obfuscation");
   Cherry Studio (Copilot token as a `safeStorage` file under `userData`). Counter-examples: Chatbox's
   "safeStorage" is `localStorage`; daintree #376 is the plaintext-JSON-to-`safeStorage` migration.

Not measured here, already on the map: Linux with and without a keyring, the async API's fallback provider on a
keyring-less machine (may report available — gate on the sync call until measured), Windows.
