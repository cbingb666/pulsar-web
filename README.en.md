<!-- source: README.md; source-sha256: e19a65aeb0afe025180157783dcfba6f37cdef27bf62b310c738da8426602c8f -->

# Pulsar Fusion Web

[中文](README.md) · [English](README.en.md)

A Web configuration tool for **Pulsar Xlite v4 Mini**, available locally or on GitHub Pages, using Chrome / Edge WebHID to access the mouse directly.

## Getting started

```sh
npm install
npm run dev
```

Open the local address printed by the terminal (normally `http://localhost:5173`) in desktop Chrome / Edge. Click **Connect mouse** and select Xlite v4, or **1K Dongle** / **8K Dongle** when using a receiver. Safari / Firefox do not provide the required WebHID. This local in-app browser also completed a hardware connection; use standalone Chrome / Edge if another embedded preview lacks WebHID or its device picker.

For wireless configuration, insert only the receiver, turn on the mouse, and confirm wireless cursor movement; no mouse cable is needed. The connection reads the paired model and permits configuration only after confirming Xlite v4. If it fails, wake the mouse, close other configuration pages/software, unplug/reinsert the receiver, and reconnect. The observed HID STALL recovered after closing other sessions and reinserting, but neither factor was independently established as the cause.

`Failed to write the feature report` is the browser's generic HID send failure, not sufficient evidence of permissions, sleep, or exclusive access. Diagnostics preserve each candidate's report length, failure stage and original error. **Export diagnostics** includes browser version and configuration traffic, never everyday keyboard/mouse input. Normal 1K / 8K connection first performs passive reads, skips failing channels or those lacking 64-byte configuration reports, then queries settings. Receiver status `05` is separately reported as no mouse response.

1K uses the native send/wait/read timing. If sending a paired-model query fails, recovery is bounded within the same connection (four attempts total); each attempt queries and validates identity anew. Diagnostics record `identityTries`. Setting writes are never automatically resent.

```sh
npm run docs:check # Translation synchronization and local links
npm test           # Protocol, transport, macros and file formats
npm run build      # TypeScript and static build
npm run preview
```

Production files are in `dist/` and can be hosted over HTTPS. No account, server or local driver bridge is required. Configurations and local macros are stored in the current browser; permissions and storage are isolated by site.

After initial authorization, refreshing or reopening the same site automatically tries authorized, currently attached supported devices and reads their configuration. It does not open a picker. If none are found, offline editing remains available; after a failed connection, use **Connect mouse** to retry. Unapplied drafts are retained and never automatically written. **Disconnect** disables auto-connect in this browser's site storage across reloads/reopens until a manual connection and read succeed. Cancelling a picker or failing to connect does not re-enable it; unexpected removal does not alter the preference. Clearing site data resets the preference; revoking device permission requires manual authorization again. This uses [WebHID authorized devices](https://developer.chrome.com/docs/capabilities/hid).

## GitHub Pages deployment

The [deployment workflow](.github/workflows/pages.yml) runs on pushes to `main` or manual dispatch: `npm ci` → documentation translation checks → tests → TypeScript/Vite build → publish `dist/`. It runs no hardware tests and uploads no installers, device backups or decompiled directories.

Select **GitHub Actions** under repository **Settings → Pages → Build and deployment**. The default project URL is `https://cbingb666.github.io/pulsar-web/`. The build uses the path returned by Pages, so images and JS/CSS share the same subpath. Local development still uses `/`.

Check the production path locally with:

```sh
npm run build -- --base /pulsar-web/
npm run preview -- --base /pulsar-web/
```

Pages HTTPS meets WebHID's secure-context requirement. The deployed site requires a separate initial mouse authorization. Drafts saved on localhost do not migrate automatically; use JSON import/export.

Pages availability for private repositories depends on the GitHub plan; see [GitHub requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). The workflow does not change repository visibility.

## Implemented features

- Real-device reads; common performance settings apply immediately, other changes remain drafts; write/readback verification with explicit failures.
- Read/switch six device profile slots; local drafts, JSON backups and import validation.
- 1–6 DPI stages, independent X/Y, 50–32000 DPI in steps of 10, active stage and individual indicator colors.
- Polling rate, 0–15 ms debounce, 0.7/1/2 mm LOD, Motion Sync, angle snapping and ripple control.
- Six buttons: mouse, wheel, keyboard combinations, DPI, profile cycling, media, shortcuts and device macros; at least one left click retained.
- DPI LED off/steady/breathing, brightness and breathing speed.
- Battery, charging and firmware version; sleep from 30 seconds to 15 minutes, low-battery threshold.
- Xlite v4 Mini wired USB flashing: official-file SHA-256, staged authorization, device checksum and reconnect/version readback; official 1.0.1.7 upgrade hardware-verified.
- Macro recording, keyboard/modifier/mouse/wheel/delay events, reordering, JSON and native Fusion CSV import/export.
- Device macro upload/readback/import/delete; button playback once, fixed count, while held or until next press. References across all slots are checked before deletion.
- Traffic logs/diagnostics; disconnect, checksum, timeout, mismatched response and partial-write handling.
- Separate confirmations for profile and factory reset; factory-reset dispatch disconnects and requires reconnection to check the actual state.

Device IDs: wired `3710:3401`, 1K `3710:5402`, 8K `3710:5403`. Only 8K enables 2K/4K/8K and receiver indicator modes. 1K hardware acceptance includes reads, DPI/polling, profile switching, power, macro upload and side-button binding with write/readback/restoration. 8K has confirmed pairing, browser reads and some writes, within the scope below.

## 1K / 8K receiver pairing and hardware acceptance

**Pair receiver** in the top bar opens without a connected mouse. It supports original 1K `3710:5402`, 8K `3710:5403` and Xlite v4; other models, Gen.2 and firmware updates are excluded. On 2026-10-25 the user confirmed hardware acceptance of the new 1K browser flow. Existing original-8K results follow below. Cancellation, timeout and removal scenarios have not completed hardware acceptance.

1. Insert only the target 1K or 8K receiver, remove other receivers and the mouse USB cable, and turn on wireless mode.
2. Hold left, right and wheel buttons together for 3–5 seconds until the LED blinks.
3. Click **Select receiver and start pairing**, then choose **1K Dongle** or **8K Dongle**. The command is sent once; wait up to 30 seconds.
4. After reported completion, the app verifies Xlite v4 identity and reads settings, retaining unapplied drafts. If the browser did not also expose the settings interface, close the dialog and **Connect mouse**, choosing that receiver to complete verification.
5. 1K supports up to 1000 Hz; 8K also offers 2000 / 4000 / 8000 Hz and receiver lighting in Power. Settings still require readback.

Implementation is based on static decompilation of the official Xlite v4 tool and V0.11 / V0.12; see [pairing evidence](docs/en/receiver-pairing-evidence.md). Both receivers share the pairing command on a separate Input/Output interface, while settings use Feature reports. MI02 and MI03 share descriptors, and browsers do not expose their USB interface numbers, so both same-model candidates receive two passive Feature reads. 1K requires one interface to return exactly one zero byte each time, with valid settings or the captured 64-byte all-zero initial buffer on its sibling. 8K requires stable valid settings on one side and the known read failure on the other. Zero buffers identify only the 1K route, never mouse identity. Incomplete, mixed-model or ambiguous results stop before pairing output. 8K routing passed a hardware read-only check using the production TypeScript resolver and native adapter; user pairing and browser connection/reads also passed.

Hardware captures show this receiver's identity and indicator replies retain the previous query address; indicator writes may keep returning the previous completion. Narrow compatibility paths preserve checksum, model and ordinary-command checks. The indicator setter is sent once and succeeds only after a fresh target-mode readback. Persistent DPI pending/stale responses have bounded read-only retries; setting writes never auto-resend. Battery `255` is unknown, not 0% or proof of sleep.

As of **2026-10-18**, this Xlite v4 Mini with its original 8K receiver had these results:

| Feature | Hardware result |
| --- | --- |
| Pairing, normal connection, settings reads | User-confirmed pairing; complete browser and production-client reads after fixes |
| DPI changes and stage switching | User-confirmed operation; logs include post-write stage reads |
| 8000 Hz configuration | Complete settings read with register 8000 Hz; actual USB frequency not measured |
| Indicator: low-battery only | Browser write and complete settings readback passed |
| Indicator: connection status | Indicator/profile reads passed; subsequent full read timed out at `07/82`, so the save did not pass end to end |

8K remains incomplete: abnormal pairing recovery, every polling rate, and the full macro/profile-switch/write matrix remain untested. The user reported slower-feeling macOS cursor motion at 8000 Hz; the cause is unresolved. Configuration readback is not a precision or latency measurement. See [verification](docs/en/verification.md). If hot reload repeats old errors, fully reload to recreate the client.

**Cancel** stops this page's waiting and closes the handle; an already sent radio pairing command cannot be recalled. Reconnect after cancellation/timeout to check the state. Pairing changes the existing wireless relationship and never starts during page load or auto-connect. **Connection diagnostics → Export diagnostics** includes selected-interface descriptors, passive checks, pairing input/output and result for further adaptation.

## Wired USB firmware flashing

Open **Power → Firmware → Flash mouse firmware**. Only the Xlite v4 Mini mouse `3710:3401` is flashed, never receivers. Currently only the statically checked and hardware-tested official **XS1 1.0.1.7** image is accepted. UI labels use `1.0.1.7`; protocol checks and diagnostics retain `00.00.10.17`. Newer mouse versions cannot be downgraded.

1. From the Xlite v4 Mini section of [Pulsar downloads](https://www.pulsar.gg/pages/download), obtain `Pulsar_Firmware_XS1_v1017_v125_T01.zip` and extract `Pulsar_Updater_v1017_v125_T01.exe`.
2. Connect only the target mouse's USB data cable; remove other Pulsar mice/receivers. Export profiles and macros first.
3. Select that `.exe`. The page extracts only mouse firmware and checks SHA-256, without executing Windows code. A raw `.bin` with the exact same hash is also accepted. ZIPs, arbitrary models and unknown versions are rejected.
4. Confirm the target, then **Select mouse and enter update mode**. The app handshakes on settings first, then switches mode through the separate updater interface.
5. Wait for USB re-enumeration, then **Select bootloader and flash**. The identity is `484D:0003` and its name may omit Pulsar. Keep only this target connected. Erase, transfer and checksum verification precede reboot.
6. **Reconnect mouse and verify**, selecting the reappearing wired Xlite v4. Completion requires `00.00.10.17` and a full configuration read. Unapplied drafts remain intact.

Do not unplug, interrupt power, close or reload during flashing. Errors never auto-repeat writes. The dialog retains its stage for reauthorization/retry, or use its back action according to the actual device mode. Diagnostics contain file metadata and control packets, not the entire firmware stream. Reloading loses the session; use the official updater to recover if the mouse is left in bootloader mode.

**On 2026-10-19 this Mac's Chrome completed one Xlite v4 Mini USB update: `00.00.10.16 → 00.00.10.17`.** The device accepted `0xcf00`; browser and independent read-only checks confirmed the new version after reboot. Six profile records, active performance/power and the empty macro list matched before/after. Inactive profiles' performance settings were not read individually by switching. Power-loss/interruption recovery, other images/models and post-update 8K reconnection remain untested. The shared bootloader ID cannot alone prove the model or that this is the previous mouse. See [firmware evidence](docs/en/firmware.md) and [verification](docs/en/verification.md).

## When changes apply

After connecting and reading:

| Setting | Commit point |
| --- | --- |
| Active DPI stage, polling, LOD, Motion Sync, angle snapping, ripple control | Immediate write/readback on selection |
| DPI X/Y numbers | Enter or blur after an actual edit |
| Debounce | Release the slider or adjustment key; focus alone does not save |
| Bindings, stage add/remove, colors/lighting, power, imported/default drafts | **Apply to mouse** |
| Macro content | Upload; its button binding still needs Apply |

Immediate actions submit only explicitly changed fields, preserving other drafts. While stage-layout/import changes are pending, DPI changes stay staged; apply the full layout before immediate DPI resumes. Offline editing/reconnection never automatically submits old drafts. External setting changes or write failures stop immediate apply and request a fresh device read.

## Verification and limits

The tested device is this Mac's Xlite v4 Mini, upgraded by wired browser USB to `00.00.10.17` on 2026-10-19. Wired, 1K and original-8K communication had passed on `00.00.10.16`. The user confirmed new 1K browser pairing on 2026-10-25 without firmware readback or individual wireless-write records. Post-update 8K regression and complete write matrices have not been repeated. See [verification](docs/en/verification.md). **This is a usable reverse-engineered implementation, without a claim of 100% Windows parity.**

Remaining limits:

- Browsers cannot change Windows pointer/double-click/scroll speed, tray or startup settings, or globally record inputs while unfocused.
- Mouse movement macro events are rejected because native serializer/parser opcodes disagree. Long delays split into verified 16-bit delays, preserving duration.
- Live RSSI and physical DPI-button notifications from the separate HID interface are not connected. Use Refresh to read state.
- Abnormal 1K/8K pairing recovery, every polling rate and actual frequency, mode-1 complete save, every button's real execution, macros across applications, interrupted flashing and destructive resets lack hardware acceptance.
- The UI supports Chinese/English, remembers its selection, and follows native assets/function grouping. It is not a pixel-perfect WinForms clone and does not reproduce other native languages.

Native CSV does not store loop mode; that belongs to the button binding. The native program does not escape the comma key: import recognizes it, while exporting it requests JSON. JSON profile files are a Web extension; only macro CSV dialogs were found in this native version.

## Interface language

Use “中文 / English” in the top bar to switch languages instantly. First use follows supported Chinese/English browser languages, falling back to English; subsequent visits remember your choice. Switching languages does not change mouse settings, profiles or macros. Profile and macro names retain user text.

See the [documentation index](docs/en/README.md) for further guidance and technical evidence.

## Project layout

- `src/protocol.ts`: models, validation, packet construction and button actions.
- `src/hid.ts`: serial WebHID transport, settings, device macros and readback.
- `src/receiver-pairing.ts`, `src/ReceiverPairingDialog.tsx`: separate 1K/8K pairing, states and guidance.
- `src/firmware-package.ts`, `src/firmware.ts`, `src/firmware-transport.ts`, `src/FirmwareFlashDialog.tsx`: fixed official-image validation, separate flashing and staged authorization.
- `src/macros.ts`, `src/macro-codec.ts`, `src/native-files.ts`: editing model, native bytes and CSV.
- `src/App.tsx`, `src/MacroEditor.tsx`: device pages and editor.
- `src/i18n.ts`, `src/use-locale.ts`, `src/locales/`: locale detection/persistence, React subscriptions and Chinese/English UI text.
- `docs/extraction.md`, `docs/native-evidence.md`, `docs/protocol.md`: extraction, native evidence and protocol; English versions live in `docs/en/`.
- `scripts/`: optional macOS/hidapi development diagnostics, not Web runtime dependencies.
- `.local/`: ignored installers, extraction/decompilation, tools and device backups.

Optional hardware commands default to read-only; `--write-test` explicitly enables temporary changes with backup/restoration. Do not run alongside other configuration tools. Termination, unplugging or power loss may interrupt restoration. Raw backups are in `.local/`.

```sh
python3 scripts/read-device.py
python3 scripts/hardware-smoke.py --write-test
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --write-test
# 1K defaults to read-only; --write-test enables temporary writes/restoration
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --product-id=0x5402
```

Original executables and decompiled source are not in build output. Mouse/brand images in `public/assets/` and `public/favicon.ico` came from the supplied software for reproduction. Original rights remain with their owners; this project grants no redistribution rights for those assets. The reference implementation's MIT notice is retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Original project code and documentation use the [MIT License](LICENSE), `Copyright (c) 2026 cbingb666`. Third-party dependencies and references retain their licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Pulsar images, icons, trademarks and firmware remain their owners' property; the project's MIT license grants no redistribution rights for those proprietary resources.
