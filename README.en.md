<!-- source: README.md; source-sha256: 0aee8a69b4872361010078f5843428b4891d5226a2eb1d5f6da01b72dab62788 -->

# Pulsar Fusion Web

[中文](README.md) · [English](README.en.md)

A Web configuration tool for **Pulsar Xlite v4 Mini**, available locally or on GitHub Pages. Use desktop Chrome / Edge to connect to the mouse.

## Getting started and connecting

Open the [online app](https://cbingb666.github.io/pulsar-web/), or run it locally:

```sh
npm install
npm run dev
```

Open the local address printed by the terminal (normally `http://localhost:5173`) in desktop Chrome / Edge. Click **Connect mouse** and choose Xlite v4, or **1K Dongle** / **8K Dongle** when using a receiver. Safari / Firefox do not support the required WebHID. If an embedded browser has no device picker, use standalone Chrome / Edge.

For wireless configuration, insert the receiver, turn on the mouse, and confirm wireless pointer movement. No mouse cable is needed. If connection fails, wake the mouse, close other configuration pages or software, unplug and reinsert the receiver, then reconnect. If it still fails, save the error information through **Connection diagnostics → Export diagnostics**. The export includes browser version, interface information, and configuration traffic, but no everyday keyboard or mouse input.

Profiles and local macros stay in the current browser. No account is required. Permissions and storage are isolated by site; localhost drafts do not migrate to the online site automatically. Use JSON import/export to transfer them.

After initial authorization, refreshing or reopening the same site automatically tries authorized, currently attached supported devices and reads their settings without a device picker. Offline editing remains available if no device is found. After a failed connection, click **Connect mouse** to retry. Unapplied local drafts are retained and are not written automatically.

**Disconnect** disables auto-connect for this site in the current browser, including after reloads or reopening, until a manual connection and settings read succeed. Cancelling a picker or a failed connection does not re-enable it. Unexpected removal does not change this preference. Clearing site data resets it; revoking device permission requires manual authorization again.

## Local deployment

```sh
npm run build
npm run preview
```

Production files are in `dist/` and can be hosted over HTTPS. No server or local driver bridge is required. Device connection needs HTTPS or localhost.

For GitHub Pages, select **GitHub Actions** under repository **Settings → Pages → Build and deployment**. Pushes to `main` automatically build and deploy the site. This project's site is `https://cbingb666.github.io/pulsar-web/`. Pages availability for private repositories depends on the GitHub plan; see [GitHub requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). See the [development guide](docs/en/development.md) for builds, path checks, and workflow details.

## Features and compatibility

- Read device settings; performance changes save in the background, while button, power, and imported draft changes are staged for confirmation.
- Read and switch six device profile slots; local drafts and JSON profile backup, import, and export.
- 1–6 DPI stages, independent X/Y, 50–32000 DPI in steps of 10, active stage, and per-stage indicator colors.
- Polling rate, 0–15 ms debounce, 0.7/1/2 mm LOD, Motion Sync, angle snapping, and ripple control.
- Six buttons: mouse, wheel, keyboard combinations, DPI, profile cycling, media, shortcuts, and device macros. At least one left-click binding must remain.
- DPI indicator off, steady, and breathing modes, plus brightness and breathing speed.
- Battery, charging, and firmware version; sleep from 30 seconds to 15 minutes and low-battery threshold.
- Macro recording, keyboard/modifier/mouse/wheel/delay events, editing and reordering, JSON and original Fusion CSV import/export.
- Device macro upload, readback, import, and deletion; button playback once, a fixed number of times, while held, or until pressed again. References across all slots are checked before deletion.
- 1K / 8K receiver pairing, communication logs, and diagnostics export.
- USB wired firmware flashing, profile reset, and factory reset. Firmware flashing and factory reset are experimental. Device resets require a separate confirmation.

| Connection | Device ID | Highest selectable polling rate |
| --- | --- | --- |
| USB wired | `3710:3401` | 1000 Hz |
| Original 1K receiver | `3710:5402` | 1000 Hz |
| Original 8K receiver | `3710:5403` | 8000 Hz |

Only the original 8K receiver offers 2000 / 4000 / 8000 Hz and receiver indicator settings. Other models and Gen.2 receivers are outside the supported scope. 8K high polling rates, lighting, and abnormal-state recovery still have compatibility limits. Read [Limits and risks](#limits-and-risks) before use.

## 1K / 8K receiver pairing

**Pair receiver** in the top bar opens without a connected mouse. It supports only original 1K / 8K receivers with Xlite v4 and does not update firmware.

1. Insert only the target 1K or 8K receiver, remove other receivers and the mouse USB cable, and turn on wireless mode.
2. Hold the left, right, and wheel buttons together for 3–5 seconds until the LED blinks.
3. Click **Select receiver and start pairing**, choose **1K Dongle** or **8K Dongle**, and wait up to 30 seconds.
4. The page reads the mouse settings after pairing and retains unapplied drafts. If the configuration connection is incomplete, close the dialog, click **Connect mouse**, and choose the receiver just paired.
5. Adjust polling rate in Performance. For an 8K receiver, receiver lighting is also available in Power.

Pairing changes the existing wireless relationship. **Cancel** only stops this page's waiting; an already sent pairing command cannot be recalled. Reconnect after cancellation or timeout to check the state. Pairing does not start during page load or auto-connect. If connection or pairing fails, save troubleshooting information through **Connection diagnostics → Export diagnostics**.

## Wired USB firmware flashing

This is experimental. Open **Power → Firmware → Flash mouse firmware**. Only the Xlite v4 Mini mouse `3710:3401` is flashed, never receivers. Only official **XS1 1.0.1.7** firmware is currently accepted. This flow cannot downgrade a mouse with a newer version.

1. From the Xlite v4 Mini section of [Pulsar downloads](https://www.pulsar.gg/pages/download), download `Pulsar_Firmware_XS1_v1017_v125_T01.zip` and extract `Pulsar_Updater_v1017_v125_T01.exe`.
2. Connect only the target mouse's USB data cable. Remove other Pulsar mice and receivers. Export profiles and macros you need to keep before flashing.
3. Select that `.exe` in the dialog. The page only extracts and validates the mouse firmware; it does not run Windows code. A raw `.bin` with identical contents is also accepted. ZIPs, other models, and unknown versions are rejected.
4. Confirm the target device, then click **Select mouse and enter update mode**.
5. Wait for the USB device to reappear, then click **Select bootloader and flash**. Its ID is `484D:0003`, and the name may omit Pulsar. Keep only this target mouse connected.
6. Click **Reconnect mouse and verify**, select the reappearing wired Xlite v4, and check its version and settings. The target version appears as `1.0.1.7` in the interface and `00.00.10.17` in raw diagnostics. Unapplied local drafts are retained.

Do not unplug, interrupt power, close, or reload the page during flashing. Flashing does not retry automatically after an error. Follow the dialog to check the device mode before retrying or going back. Reloading loses this update session. If the mouse remains in bootloader mode, use the official updater to recover. The bootloader ID is shared and cannot identify the model or prove that it is the previous mouse; keep only the target device connected.

Power-loss or interruption recovery, other firmware/models, and post-update 8K wireless reconnection remain unconfirmed. Preservation of inactive slots' performance settings and nonempty macros after flashing is also not fully confirmed. See [firmware details](docs/en/firmware.md) and [verification](docs/en/verification.md) for file hashes and technical evidence.

## When changes apply

After connecting and reading the device, performance changes save in the background without clicking **Apply to mouse**:

| Setting | Save point |
| --- | --- |
| Active DPI stage, stage add/remove, polling rate, LOD, Motion Sync, angle snapping, ripple control, DPI lighting effect | Save automatically on selection |
| DPI X/Y numbers | Enter or leaving the field after an actual edit |
| DPI stage colors | Save automatically when color selection is complete |
| Debounce, lighting brightness, breathing speed | Release the slider or adjustment key; focus alone does not save |
| Button bindings, power, imported/default drafts | **Apply to mouse** |
| Macro content | Upload; its button binding still needs Apply |

You can keep adjusting performance settings while saving. Each action saves only the settings changed by that action and retains other drafts. If a DPI layout has not been applied, changing a DPI value, switching stages, choosing a stage color, or adding/removing a stage saves the entire visible DPI stage layout. Other drafts still require **Apply to mouse**.

Offline editing, importing a profile, and reconnecting never automatically write old drafts. External device-setting changes or background save failures pause automatic saving and display an error. Read the actual settings again before continuing.

## Limits and risks

- Browsers cannot change Windows pointer speed, system double-click/scroll speed, tray, or startup settings, or record global keyboard/mouse input while the page is unfocused.
- Mouse movement paths in macros are not supported. Long delays retain their total duration, but conversion may increase the device event count.
- Live wireless signal display and automatic updates from the physical DPI button are not supported. Click **Read again** to refresh state. Unknown battery is not 0% or proof of sleep.
- Recovery after 1K / 8K pairing cancellation, timeout, or removal; stability at every polling rate and actual USB report frequency; execution of every button action; macros across applications; and destructive resets are not fully confirmed.
- After switching the 8K receiver to **Show connection status** lighting mode, reading the full settings may time out. macOS may have slower-feeling pointer motion at 8000 Hz; the cause is unconfirmed. A configured polling rate is not a measurement of actual USB frequency or latency.
- 8K wireless compatibility evidence is limited to firmware `00.00.10.16`. 8K wireless reconnection after upgrading to `1.0.1.7` remains unconfirmed.
- Factory reset is experimental, clears custom settings, and disconnects the device. Export profiles and macros first, then reconnect to check the actual state afterward.

Original CSV files do not store loop mode; set it in the device button binding. Use JSON to export macros containing the comma key. JSON profiles use the Web app's format. Import original macro CSV files in the macro editor.

See [verification](docs/en/verification.md), [receiver pairing](docs/en/receiver-pairing-evidence.md), and [file formats](docs/en/native-files.md) for compatibility scope and detailed evidence.

## Interface language

Use **中文 / English** in the top bar to switch languages. First use follows the browser's Chinese or English language, falling back to English if unsupported. Later visits remember your choice. Switching languages does not change mouse settings, profiles, or macros. Profile and macro names retain user text.

See the [documentation index](docs/en/README.md) for further usage guidance, development, and protocol information.

## License

Original project code and documentation use the [MIT License](LICENSE), `Copyright (c) 2026 cbingb666`. Third-party dependencies and references retain their licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). Pulsar images, icons, trademarks, and firmware remain their owners' property. The project's MIT license grants no redistribution rights for these proprietary resources. Original executables and decompiled source are not included in build output.
