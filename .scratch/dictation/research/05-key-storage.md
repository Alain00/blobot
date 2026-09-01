# Where a key can live

Findings for `.scratch/dictation/issues/05-where-a-key-can-live.md`.

**Evidence labels:**

- **OBSERVED** — run on this machine (macOS, Apple Silicon, Electron **44.0.0** / Chromium 152.0.7977.54, the
  `electron` binary in `apps/desktop/node_modules`, ad-hoc signed), 2026-09-01. Probe script and raw output at the foot.
- **SOURCE** — read from Electron's `44-x-y` branch or from Chromium's tree. Electron 44 pins Chromium
  `152.0.7977.x`, whose upstream tree no longer has `components/os_crypt/sync/`; Electron carries
  `revert_oscrypt_remove_sync_backend.patch` to keep it, so the sync-side Chromium quotes below are from tag
  `146.0.7680.0`, the last upstream tree that still has those files. Logic identical to what Electron reverts to.
- **DOCUMENTED** — stated by first-party docs; URL cited.
- **INFERRED** — reasoning, not verified.

Linux and Windows are **not measured** here (this is a Mac); the map already lists that measurement under *Not yet
specified*. Everything Linux-specific below is SOURCE or DOCUMENTED.

The repo has **no `safeStorage` usage today** (`grep -rn safeStorage apps/desktop/src packages/core/src` → nothing).

---

## 0. TL;DR

1. **`safeStorage` is an encryptor, not a store.** It returns a `Buffer`; blobot keeps the bytes. The keychain
   (macOS) or keyring (Linux) holds only a random *password* from which the AES key is derived; DPAPI (Windows)
   holds nothing at all — the key is the user's logon credential. The honest sentence is therefore
   **"encrypted with a key the OS keychain holds; the encrypted key lives in blobot's `userData`"** — never "in the
   keychain". Store the `Buffer` beside `runtime-options.json`, not in SQLite (ticket 01's own rule).
2. **Linux `basic_text` is refusable, and refused by default.** With `basic_text` selected,
   `isEncryptionAvailable()` is `false` and `encryptString` throws, unless the app first calls
   `setUsePlainTextEncryption(true)`. blobot simply never calls that. But the honest gate is
   `isEncryptionAvailable()`, not the backend name: a selected `gnome_libsecret` whose keyring fails to initialise
   silently falls back to the same hardcoded key while `getSelectedStorageBackend()` still says `gnome_libsecret`.
3. **`basic_text` is AES-128-CBC under `PBKDF2("peanuts", "saltysalt", 1 iteration)` with an IV of sixteen
   spaces** — constants in the public Chromium source. VS Code's own words: "at best, obfuscation".
4. **macOS prompt behaviour, observed:** first use creates the keychain item with no dialog; a rerun of the same
   binary asks nothing (18 ms). The item's ACL binds `decrypt` to the **exact cdhash** of `Electron.app`, so the
   dialog appears whenever the binary changes — every `electron` version bump in dev, every rebuild — and reads
   *"<App>" wants to use your confidential information stored in "<app.name> Safe Storage" in your keychain*, with
   Allow / Always Allow / Deny. A Developer ID signature changes the partition to the team id, which is why Electron
   says a signed app "behaves consistently". In dev today the item would be named **`@blobot/desktop Safe Storage`**.
5. **Env var:** `BLOBOT_<PROVIDER>_API_KEY` (never the provider's own `OPENAI_API_KEY`), **environment wins** over
   the stored key (gh's rule), Settings names the source and offers no *remove*, and the variable must be **stripped
   from every spawned runtime's environment** (the Cursor adapter already does this for `CURSOR_API_KEY`) — a
   key in blobot's environment is otherwise inherited by every agent, which breaks "never shown to a runtime".
6. **Precedents:** Signal Desktop (SQLCipher key as hex in `config.json`, refuses `basic_text`), VS Code (all
   secrets via `safeStorage`, documents `--password-store`), Cherry Studio (Copilot token as a `safeStorage` file
   under `userData`). Counter-example: Chatbox's "safeStorage" is `localStorage`.

---

## 1. Backends per OS

### 1.1 What the docs say (DOCUMENTED, Electron 44)

`docs/api/safe-storage.md` on `44-x-y`
(https://github.com/electron/electron/blob/44-x-y/docs/api/safe-storage.md):

- **macOS**: "Encryption keys are stored for your app in Keychain Access in a way that prevents other applications
  from loading them without user override. Therefore, content is protected from other users and other apps running
  in the same userspace."
- **Windows**: "Encryption keys are generated via DPAPI … content is protected from other users on the same machine,
  but not from other apps running in the same userspace."
- **Linux**: "Encryption keys are generated and stored in a secret store that varies depending on your window manager
  and system setup. Options currently supported are `kwallet`, `kwallet5`, `kwallet6` and `gnome-libsecret` …
  Note that not all Linux setups have an available secret store. If no secret store is available, items stored in
  using the `safeStorage` API will be unprotected as they are encrypted via hardcoded plaintext password. You can
  detect when this happens when `safeStorage.getSelectedStorageBackend()` returns `basic_text`."
- `isEncryptionAvailable()`: "On Linux, returns true if the app has emitted the `ready` event and the secret key is
  available. On MacOS, returns true if Keychain is available. On Windows, returns true once the app has emitted the
  `ready` event."
- `getSelectedStorageBackend()` (*Linux only*) returns `basic_text` "when the desktop environment is not recognised or
  if … `--password-store="basic"`", `gnome_libsecret` for `X-Cinnamon`, `Deepin`, `GNOME`, `Pantheon`, `XFCE`,
  `UKUI`, `unity` or `--password-store="gnome-libsecret"`, `kwallet`/`kwallet5`/`kwallet6` for `kde4`/`kde5`/`kde6`
  or the matching flag, and `unknown` before `ready`.
- `setUsePlainTextEncryption(usePlainText)`: "will force the module to use an in memory password for creating
  symmetric key … when a valid OS password manager cannot be determined … a no-op on Windows and MacOS."
- The docs now **recommend the async API** (`encryptStringAsync` / `decryptStringAsync`) and say the sync one "may be
  deprecated in a future version". The async Linux providers are `org.freedesktop.portal.Secret` (preferred under
  Flatpak), the Secret Service API, and "a fallback provider … for environments without a secret service available".

**OBSERVED on macOS:** `safeStorage.getSelectedStorageBackend` is **not a function** (`TypeError`); it exists only on
Linux builds. Guard the call by `process.platform`.

### 1.2 How the Linux backend is actually chosen (SOURCE)

Electron, `shell/browser/electron_browser_main_parts.cc` (`44-x-y`, `PostCreateMainMessageLoop`):

```cpp
config->store = command_line.GetSwitchValueASCII(password_manager::kPasswordStore);
config->product_name = app_name;
config->application_name = app_name;
config->should_use_preference = command_line.HasSwitch(password_manager::kEnableEncryptionSelection);
...
os_crypt::SelectedLinuxBackend selected_backend =
    os_crypt::SelectBackend(config->store, use_backend, desktop_env);
fake_browser_process_->SetLinuxStorageBackend(selected_backend);
OSCrypt::SetConfig(std::move(config));
```

Chromium, `components/os_crypt/sync/key_storage_util_linux.cc` (tag 146.0.7680.0,
https://chromium.googlesource.com/chromium/src/+/refs/tags/146.0.7680.0/components/os_crypt/sync/key_storage_util_linux.cc):

```cpp
// Explicitly requesting a store overrides other production logic.
if (type == "kwallet")  return KWALLET;   if (type == "kwallet5") return KWALLET5;
if (type == "kwallet6") return KWALLET6;  if (type == "gnome-libsecret") return GNOME_LIBSECRET;
if (type == "basic")    return BASIC_TEXT;
if (!use_backend)       return BASIC_TEXT;
switch (desktop_env) {
  case KDE4: return KWALLET;  case KDE5: return KWALLET5;  case KDE6: return KWALLET6;
  case CINNAMON: case DEEPIN: case GNOME: case PANTHEON: case UKUI: case UNITY: case XFCE: case COSMIC:
    return GNOME_LIBSECRET;
  case KDE3: case LXQT: case OTHER: return BASIC_TEXT;
}
```

`desktop_env` comes from `base/nix/xdg_util.cc`: **`XDG_CURRENT_DESKTOP` first** (colon-separated, priority order,
so Ubuntu's `ubuntu:GNOME` resolves to GNOME), then `DESKTOP_SESSION`, then `GNOME_DESKTOP_SESSION_ID` /
`KDE_SESSION_VERSION`. A window manager that sets none of these — sway, Hyprland, i3, a bare X session, an SSH
session — is `OTHER` → `basic_text`, **even if gnome-keyring is running**. The flag is the only way through in that
case.

`--password-store` is a **Chromium switch** (`password_manager::kPasswordStore`), not listed in Electron's
`command-line-switches.md`. It is read once, before the message loop, so it works from argv or from
`app.commandLine.appendSwitch('password-store', 'gnome-libsecret')` **before `ready`**. VS Code exposes exactly this
knob to users (§5.2).

### 1.3 "Selected" is not "working" (SOURCE — the trap)

`getSelectedStorageBackend()` returns the result of `SelectBackend`, computed from environment variables **before
anything talks to D-Bus**. Whether the keyring actually answers is decided later, lazily, in
`OSCryptImpl::DeriveV11Key()` (`os_crypt_linux.cc`):

```cpp
key_storage = KeyStorageLinux::CreateService(*config_);
if (!key_storage) { try_v11_ = false; return false; }   // No backend available, can't do v11.
```

and `KeyStorageLinux::CreateServiceInternal` logs `"OSCrypt tried Libsecret but couldn't initialise."` and returns
`nullptr` when the Secret Service is not reachable (no daemon, no session bus, locked and cancelled). At that point
`EncryptString` **silently uses the v10 hardcoded key**:

```cpp
if (DeriveV11Key()) { key = *v11_key_; *ciphertext = kObfuscationPrefixV11; }
else               { key = kV10Key;   *ciphertext = kObfuscationPrefixV10; }
```

Two consequences:

- `isEncryptionAvailable()` is the truthful gate. Chromium's own comment: *"IsEncryptionAvailable() actually means
  'is real encryption backed by the system secret store available', which here means a v11 key is available, as
  opposed to the hardcoded v10 obfuscation key."*
- `getSelectedStorageBackend()` is the **explanation** for the user (*"no keyring was found for GNOME"*), not the
  decision. A Settings sentence that reads only the backend name can say `gnome_libsecret` while the bytes went out
  under `peanuts`.

### 1.4 Can an app refuse `basic_text`? Yes — and Electron refuses it for you (SOURCE)

`shell/browser/api/electron_api_safe_storage.cc` (`44-x-y`):

```cpp
bool SafeStorage::IsEncryptionAvailable() {
  if (!electron::Browser::Get()->is_ready()) return false;
#if BUILDFLAG(IS_LINUX)
  return OSCrypt::IsEncryptionAvailable() ||
         (use_password_v10_ && ...->linux_storage_backend() == "basic_text");
#else
  return OSCrypt::IsEncryptionAvailable();
#endif
}
```

`use_password_v10_` is what `setUsePlainTextEncryption(true)` sets. So on Linux with no working secret store:

| App called `setUsePlainTextEncryption(true)`? | `isEncryptionAvailable()` | `encryptString()` |
| --- | --- | --- |
| no (default) | `false` | throws `"Error while encrypting the text provided to safeStorage.encryptString. Encryption is not available."` |
| yes | `true` (only if the selected backend is literally `basic_text`) | returns a `v10` buffer under the hardcoded key |

**blobot never calls `setUsePlainTextEncryption`.** The refusal is then Electron's default, and the app's only job is
to not swallow the `false` — and to say what it means, which is where the env var comes in (§4). Note the asymmetry
in the second row: the opt-in only rescues a *selected* `basic_text`; a selected-but-broken `gnome_libsecret` stays
`false` either way.

**Async API caveat (INFERRED, unmeasured):** Electron 44's async path (`CreateOSCryptAsync` in
`browser_process_impl.cc`) registers a `PosixKeyProvider` at precedence 5 "used as a fallback" on Linux, and the
docs describe "a fallback provider … for environments without a secret service available". That reads as
`isAsyncEncryptionAvailable()` resolving `true` on a keyring-less machine. Until the Linux measurement says
otherwise, **gate on the sync `isEncryptionAvailable()`**, whose semantics are quoted above, and only then use
whichever API to do the work.

### 1.5 What `basic_text` is (SOURCE)

`os_crypt_linux.cc`:

```cpp
constexpr crypto::kdf::Pbkdf2HmacSha1Params kParams{ .iterations = 1 };
const auto kSalt = base::byte_span_from_cstring("saltysalt");
// PBKDF2-HMAC-SHA1(1 iteration, key = "peanuts", salt = "saltysalt")
constexpr auto kV10Key = std::to_array<uint8_t>({0xfd, 0x62, 0x1f, 0xe5, ...});
const std::array<uint8_t, crypto::aes_cbc::kBlockSize> kIv{ ' ', ' ', ... };   // sixteen spaces
```

AES-128-CBC, fixed key, fixed IV, and both are in a public repository. Any process on the machine that can read the
file can decrypt it with a one-liner. Not a ceiling worth describing as "encrypted" to a user.

---

## 2. What `safeStorage` encrypts, and where the bytes must live

### 2.1 The mechanism (SOURCE + OBSERVED)

`encryptString(plainText)` → `Buffer` = 3-byte version prefix (`v10` or `v11`) + AES-128-CBC ciphertext.
**OBSERVED** on macOS: a 19-character key became a 35-byte buffer starting `v10`; decrypt round-tripped; the async
API produced the same `v10` shape with `shouldReEncrypt: false`.

Where the *key* comes from, per OS:

| OS | What the OS holds | Where | How the AES key is made |
| --- | --- | --- | --- |
| macOS | a random password | login keychain, generic-password item, service **`<app.name> Safe Storage`** (`electron_browser_main_parts.cc`: `KeychainPassword::GetServiceName() = app_name + " Safe Storage"`); **OBSERVED** account `"blobot-probe Key"` | `PBKDF2-HMAC-SHA1(password, "saltysalt", 1003 iterations)` → AES-128-CBC, IV = 16 spaces (`os_crypt_mac.mm`) |
| Windows | nothing of the app's | DPAPI derives from the user's logon credential | `CryptProtectData` |
| Linux (v11) | a random password | Secret Service item / KWallet folder `"<app> Keys"`, item `"<app> Safe Storage"` (`browser_process_impl.cc`) | `PBKDF2-HMAC-SHA1(password, "saltysalt", 1 iteration)` → AES-128-CBC |
| Linux (v10) | nothing | — | the constant above |

**The ciphertext never enters any of those stores.** Electron hands it back and forgets it. The app writes it
somewhere; Signal writes hex into `config.json`, Cherry Studio writes the raw buffer to a file, both under
`userData`.

### 2.2 The honest sentence

- True: **"Encrypted with a key that your OS keychain holds. The encrypted key is kept in blobot's data folder."**
- False: "Stored in your keychain." (The keychain has a password named after blobot; it has never seen the API key.)
- Also true, and worth a per-OS clause because the docs draw the line differently:
  - macOS: another app that wants to *decrypt* must get through the keychain ACL (§3), so the user is asked.
  - Windows: "not [protected] from other apps running in the same userspace" — any process as this user can decrypt.
  - Linux with a keyring: any process on the session bus can read the password once the keyring is unlocked
    (VS Code's docs make the same admission for `basic`; for a keyring it is one D-Bus call away).

### 2.3 Where blobot should put the bytes (INFERRED, from repo conventions)

`userData` already holds `blobot.db` and `runtime-options.json` (`apps/desktop/src/main/index.ts:950-953`). A third
small file beside them — one JSON object per provider: `{ provider, ciphertext: <base64>, backend, savedAt }` — keeps
ticket 01's "never SQLite" and gives Settings something to name. Recording the `backend` string at save time is what
lets the app say later *"saved on 2026-09-01 through gnome_libsecret"*.

`isEncryptionAvailable()` is `false` before `ready` (**OBSERVED**), and `encryptString` throws
`"safeStorage cannot be used before app is ready"` (SOURCE). Everything here belongs after `whenReady()`.

---

## 3. The macOS keychain prompt

### 3.1 Observed on this machine (ad-hoc signed dev Electron)

`codesign -dv` on `apps/desktop/node_modules/electron/dist/Electron.app`: `Signature=adhoc`,
`flags=0x20002(adhoc,linker-signed)`, `TeamIdentifier=not set`.

- **Run 1** (no prior item, `app.setName('blobot-probe')`): `isEncryptionAvailable() === true`, encrypt + decrypt +
  async in **18 ms**, **no dialog**. A keychain item appeared in `login.keychain-db`, service
  `blobot-probe Safe Storage`, account `blobot-probe Key`.
- **Run 2** (same binary): 11 ms, **no dialog**.
- The item's ACL, from `security dump-keychain -a`:

  ```
  entry 1: authorizations (6): decrypt derive export_clear export_wrapped mac sign
           applications (1): .../electron/dist/Electron.app
             requirement: cdhash H"36e04f995695f9d20e05a95d26ebf5304def5b0f"
  entry 3: authorizations (1): partition_id
           description: cdhash:36e04f995695f9d20e05a95d26ebf5304def5b0f
  ```

  `decrypt` is granted to **one code-directory hash**. `partition_id` is the cdhash too, because an ad-hoc signature
  has no team. The moment the binary changes — `electron@44.0.1`, a rebuilt bundle, electron-builder's packaged app,
  a copy re-signed with `codesign -s -` — the requirement fails and macOS asks.

(The probe's keychain item and `~/Library/Application Support/blobot-probe` were deleted afterwards.)

### 3.2 What the user sees, and what the buttons do (DOCUMENTED)

Apple, *If you're asked for access to your keychain on Mac*
(https://support.apple.com/guide/keychain-access/if-youre-asked-for-access-to-your-keychain-kyca1243/mac): the dialog
reads *"<App>" wants to use your confidential information stored in "<item>" in your keychain* and offers **Allow
Once** ("You are asked again the next time"), **Always Allow** ("without any further authorization or notice from
you" — adds the new cdhash to entry 1 above), and **Deny**. On Deny, `KeychainPassword::GetPassword()` returns empty,
`DeriveKey()` fails, and — SOURCE, `os_crypt_mac.mm` — `try_keychain_ = false; // Never try it again` for the life
of the process: `isEncryptionAvailable()` is `false` until relaunch. Electron's docs add that "these calls can block
the current thread to collect user input", so the main process is frozen while the dialog is up.

### 3.3 Unsigned versus signed (DOCUMENTED + INFERRED)

Electron, `docs/tutorial/code-signing.md` (`44-x-y`), *macOS APIs that require code signing*: "`safeStorage` —
Without a valid, consistent code signature, macOS may be unable to tell that two builds of your unsigned app are
'the same app', which can cause the Keychain to prompt the user for permission again after every update." The
`safe-storage.md` IMPORTANT box says the same. Electron issues
[#40236](https://github.com/electron/electron/issues/40236) and
[#43233](https://github.com/electron/electron/issues/43233) are this exact report (prompt after an Electron minor
bump), both closed *not planned*. With a Developer ID signature the partition becomes `teamid:<TEAM>` and the ACL
matches any build of the same team, so the prompt does not recur across updates (INFERRED from the ACL shape; not
measured — there is no signing identity on this machine).

For blobot this means: **every developer on a dev build will meet the dialog on every `electron` bump**, and
*Always Allow* is the right answer for them; a released, signed build meets it once or never. The Settings copy
should not promise "no prompts".

### 3.4 The item is named after `app.name`, and dev has a bad one

`electron_browser_main_parts.cc` names the item `app_name + " Safe Storage"`. Electron issue
[#45328](https://github.com/electron/electron/issues/45328) (open, needs-docs): call anything on `safeStorage` before
`ready` and the item is created as **`Chromium Safe Storage`** instead. Two facts about this repo:

- The desktop package's `name` is `@blobot/desktop` and nothing calls `app.setName` (grep); the dev app's `userData`
  is `~/Library/Application Support/@blobot/…` (**OBSERVED**). So the dialog in dev would read
  *"Electron" wants to use … stored in "@blobot/desktop Safe Storage"*.
- `app.setName` also **moves `userData`** (`app.getPath('userData')` derives from the name), which would strand
  `blobot.db`. So a nicer item name is a decision with a migration attached, not a one-liner; flag it to the build
  ticket rather than fixing it in passing.

---

## 4. The environment-variable fallback

### 4.1 Name (INFERRED, from repo and provider conventions)

- **`BLOBOT_<PROVIDER>_API_KEY`** (e.g. `BLOBOT_OPENAI_API_KEY`, `BLOBOT_DEEPGRAM_API_KEY`, whichever ticket 03
  keeps), one per provider in the closed list, matching the repo's `BLOBOT_LIVE_*` prefix habit.
- **Never read the provider's own variable** (`OPENAI_API_KEY`, `DEEPGRAM_API_KEY`). The user's shell carries those
  for other tools; blobot picking one up silently would send their voice under a key they never handed to blobot,
  which is the opposite of what ticket 01's exception is narrow *for*. A `BLOBOT_`-prefixed name can only have been
  set on purpose, for this.

### 4.2 It must not reach a runtime (SOURCE, this repo)

blobot's main process spawns every agent, and a child inherits `process.env` unless the spawner edits it. The Cursor
adapter already does this for the same reason: `packages/core/src/adapters/cursor/stdio.ts:81-94` — *"Stripping
`CURSOR_API_KEY` and `CURSOR_AUTH_TOKEN` is load-bearing"*, `delete env['CURSOR_API_KEY']`. The same must be done
for `BLOBOT_*_API_KEY` in **every** adapter's spawn path (and in `runtime-step.ts`'s PTY, which runs from the same
environment), or "never shown to a runtime" is false the day someone sets the variable. This is the one place the env
var is more dangerous than the keychain path: the keychain key exists only inside main's memory, the env var is in
every child by default.

### 4.3 Precedence (DOCUMENTED precedent)

GitHub CLI, `gh help environment` (https://cli.github.com/manual/gh_help_environment): `GH_TOKEN` is "an
authentication token … Setting this avoids being prompted to authenticate and **takes precedence over previously
stored credentials**." `gh auth status` reports which one is in use, and `gh auth logout` cannot remove an
environment token. Recommendation: same rule — **environment wins**. A variable is an explicit, per-shell statement
the user made *after* whatever they typed into Settings, and a stored key silently overriding it is the surprising
direction.

### 4.4 Fallback or always a door? (INFERRED)

The map words it as a fallback "when the OS has no backend". Two arguments for making it **always a door**:

- A variable that is honoured on a keyring-less Linux box and silently ignored on the same user's Mac is a surprise
  that surfaces as "why is it using the old key".
- It is also the only path for a headless/CI run and for the developer who does not want a keychain dialog on every
  `electron` bump (§3.3).

Either way the app must say which source it used. This is ticket 01's call; the facts do not force it.

### 4.5 One real limitation: a GUI launch has no shell environment

`.scratch/first-demo/research/11-agent-detection.md` §1.1: an app launched from the Dock or a `.desktop` entry
inherits `launchd`'s / the session manager's environment, not `~/.zshrc`. So on macOS the variable is effectively
**terminal-launch only** unless the user goes through `launchctl setenv`; on Linux it depends on whether the display
manager sources `~/.profile` / `environment.d`. Settings should say *"from the environment"* only when it actually
read it, and should not suggest the variable as the ordinary path on macOS, where the keychain works.

### 4.6 What Settings says when the key came from the environment (INFERRED, mirrors gh)

- Name the source and the variable: *"using the key in `BLOBOT_OPENAI_API_KEY` · set in this session's environment"*.
- **No remove control** (there is nothing to remove); instead one sentence: *"unset it in the shell that launched
  blobot to stop using it"*. Disabling a *remove* button that cannot work is worse than not drawing it.
- If a stored key also exists, say that it is being shadowed — *"a saved key is on file and not in use while this is
  set"* — so the day the variable goes away the behaviour is not a mystery.
- Never echo the value; at most a masked tail (`…a1b2`), the convention every provider dashboard uses.

---

## 5. Precedents

### 5.1 Signal Desktop — the strictest reading of `basic_text` (SOURCE)

Commit `e87eaff` *Use electron's safeStorage API*
(https://github.com/signalapp/Signal-Desktop/commit/e87eaff94824878ed432274bb598af9536709e9c), `app/main.ts`:

- What is protected: the **SQLCipher database key**. Stored as `safeStorage.encryptString(key).toString('hex')`
  under `encryptedKey` in `config.json` in `userData`; the legacy plaintext `key` is migrated when encryption becomes
  available.
- The gate:
  ```ts
  const isEncryptionAvailable = safeStorage.isEncryptionAvailable() &&
    (!OS.isLinux() || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  ```
  i.e. they do not trust `isEncryptionAvailable()` alone and additionally refuse a selected `basic_text` — belt and
  braces against a future Electron where the opt-in default changes. Worth copying verbatim.

### 5.2 VS Code — the documented `--password-store` knob (SOURCE + DOCUMENTED)

`src/vs/platform/encryption/electron-main/encryptionMainService.ts`
(https://github.com/microsoft/vscode/blob/main/src/vs/platform/encryption/electron-main/encryptionMainService.ts):
all extension secrets and Settings Sync tokens go through `safeStorage`; on Linux it reads
`app.commandLine.getSwitchValue('password-store')` and calls `safeStorage.setUsePlainTextEncryption(true)` **only
when the user explicitly passed `basic`**; `getKeyStorageProvider()` reports `getSelectedStorageBackend()` so the UI
can name it.

User docs, *Settings Sync → Troubleshooting keychain issues*
(https://code.visualstudio.com/docs/configure/settings-sync#_troubleshooting-keychain-issues): flag values
`kwallet5`, `gnome-libsecret` ("any package implementing the Secret Service API (such as gnome-keyring, kwallet5, or
KeepassXC)"), `kwallet` (not recommended), `basic` — and of `basic`: *"this fallback strategy is, at best,
obfuscation, and should only be used if you are accepting of the risk that any process on the system could, in
theory, decrypt your stored secrets."* Persisted through `argv.json` as `"password-store": "gnome-libsecret"`.

That is the model for blobot's Linux story: refuse by default, expose the flag as the remedy in words, and let the
user who knows what they are doing pass `basic`.

### 5.3 Cherry Studio — an Electron LLM client (SOURCE)

`src/main/services/CopilotService.ts`
(https://github.com/CherryHQ/cherry-studio/blob/main/src/main/services/CopilotService.ts): the GitHub Copilot
token is `safeStorage.encryptString(token)` written as a raw file under the app's data directory and
`decryptString(Buffer.from(...))` on read — the same "encrypt, then the app files it" shape. A GitHub code search for
`safeStorage` in that repository returns only this service and its test; nothing in it checks
`isEncryptionAvailable()` or the Linux backend.

### 5.4 Counter-examples, for the ADR's "why not the obvious thing"

- **Chatbox** (`chatboxai/chatbox`, `src/renderer/stores/safeStorage.ts`): despite the file name, it is a
  `zustand` persist adapter over **`window.localStorage`** — provider API keys sit in the renderer's LevelDB in
  clear. An Electron LLM client that stores keys in plaintext is the norm, not the exception.
- **daintree** issue #376 (https://github.com/daintreehq/daintree/issues/376): the same migration Signal did,
  proposed for an OpenAI key held in a plaintext JSON file — encrypt to a `Buffer`, keep it as hex in the same file.

---

## 6. What this settles for the ADR (ticket 01) and the build (ticket 12)

- Gate: `app.whenReady()` → `safeStorage.isEncryptionAvailable()` `&&` (`!linux || getSelectedStorageBackend() !==
  'basic_text'`). Never call `setUsePlainTextEncryption`. On `false`: no saving, the Settings field explains why,
  names `--password-store=gnome-libsecret` and the env var as the two ways through.
- Storage: one JSON beside `runtime-options.json`, base64 ciphertext plus the backend name at save time.
- Copy: "encrypted with a key your OS keychain holds; kept in blobot's data folder" — plus, on Windows, that other
  apps running as you can read it, because the docs say so.
- macOS: expect the dialog in dev on every Electron bump; a signed release does not recur. Do not promise silence.
  The dev item name is `@blobot/desktop Safe Storage` until someone decides `app.setName` and its `userData` move.
- Env var: `BLOBOT_<PROVIDER>_API_KEY`, wins over the stored key, stripped from every child environment, reported
  by source in Settings with no remove control.
- Still to measure (already on the map): Linux with and without a keyring, the async API's fallback provider on a
  keyring-less machine, Windows.

---

## Appendix — probe

`main.cjs`, run with the repo's `apps/desktop/node_modules/.bin/electron` (44.0.0):

```js
const { app, safeStorage } = require('electron');
app.setName('blobot-probe');
const before = safeStorage.isEncryptionAvailable();
app.whenReady().then(async () => {
  const out = { isEncryptionAvailable_beforeReady: before, isEncryptionAvailable: safeStorage.isEncryptionAvailable() };
  try { out.backend = safeStorage.getSelectedStorageBackend(); } catch (e) { out.backend_error = e.message; }
  const buf = safeStorage.encryptString('sk-probe-0123456789');
  out.prefix = buf.subarray(0, 3).toString(); out.len = buf.length; out.roundtrip = safeStorage.decryptString(buf);
  out.async = await safeStorage.isAsyncEncryptionAvailable();
  out.asyncDecrypt = await safeStorage.decryptStringAsync(await safeStorage.encryptStringAsync('x'));
  console.log(JSON.stringify(out)); app.quit();
});
```

Output, run 1:

```json
{ "platform": "darwin", "electron": "44.0.0", "chrome": "152.0.7977.54", "appName": "blobot-probe",
  "userData": "/Users/guillermo/Library/Application Support/blobot-probe",
  "isEncryptionAvailable_beforeReady": false, "isEncryptionAvailable": true,
  "getSelectedStorageBackend_error": "safeStorage.getSelectedStorageBackend is not a function",
  "cipher_prefix": "v10", "cipher_len": 35, "roundtrip": "sk-probe-0123456789",
  "async_available": true, "async_prefix": "v10", "async_decrypt": { "shouldReEncrypt": false, "result": "x" },
  "ms": 18 }
```

Keychain after run 1 (`security find-generic-password -s "blobot-probe Safe Storage"`, attributes only):
`class: "genp"`, `"svce"="blobot-probe Safe Storage"`, `"acct"="blobot-probe Key"`, in `login.keychain-db`. ACL as
quoted in §3.1. Run 2 identical, 11 ms, no dialog. Item and `userData` folder deleted afterwards.
