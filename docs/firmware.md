# Xlite v4 Mini firmware flashing

Investigation date: 2026-10-19. This implementation supports the original Xlite v4 Mini mouse over a USB cable, using the verified original XS1 `1.0.1.7` firmware image. The normal device is `3710:3401`; its updater bootloader is `484d:0003`. Receiver flashing, wireless flashing, other mouse models, CrazyLight/Gen.2 firmware, arbitrary images, and other firmware versions are outside this implementation's accepted scope.

The transfer protocol below was recovered by static inspection of the official Windows updater. It is not a published Pulsar protocol specification. On 2026-10-19, the user's Xlite v4 Mini completed an in-app Chromium/WebHID USB update from `00.00.10.16` to `00.00.10.17`, including bootloader entry, checksum acceptance, reboot, and version readback. This is one verified device/image path, not acceptance of other models or interrupted-update recovery.

## Official source and file validation

The [official Pulsar download page](https://www.pulsar.gg/pages/download) lists `V1.0.1.7`, dated `2025-01-23`, for the standard Xlite v4 Mini, Medium, and Large. Its listed change addresses intermittent freezing during macros. The product sections link to this exact [XS1 v1017/v125 T01 ZIP package](https://www.pulsar.gg/cdn/shop/files/Pulsar_Firmware_XS1_v1017_v125_T01.zip?v=17283837107428289241).

| Artifact | Size in bytes | SHA-256 |
| --- | ---: | --- |
| `Pulsar_Firmware_XS1_v1017_v125_T01.zip` | 2,463,017 | `5ad169927c977bdc96bc2faae896d0136e5d346d87b2dfb4640aededf5ba5bc6` |
| `Pulsar_Updater_v1017_v125_T01.exe` inside the ZIP | 4,830,208 | `64260b82185aa80bcb70fcab427340139c115ae95f4e0fd2101e0bdf54ee30d5` |
| Extracted normal mouse image | 120,020 | `53b7aa8ca14600d385448263d2d1761d7d4517c9c3fb4d59b7657c6a9b6ba29a` |

`src/firmware-package.ts` accepts the exact EXE or the exact extracted mouse image, checking both size and SHA-256. A filename or extension alone never establishes compatibility. ZIP archives are not imported directly: the user extracts the official archive and selects its EXE. The EXE is read as bytes and is never executed. The application does not bundle or redistribute the firmware.

For the accepted EXE, the importer extracts the half-open byte range `[0x261210, 0x27e6e4)`: offset `2,494,992`, length `0x1d4d4` / `120,020`. It then verifies the extracted image's SHA-256 independently. Validated bytes remain private to the importer; callers receive immutable metadata, and fabricated metadata objects cannot authorize a transfer.

The updater's PE image base is `0x140000000`. Mouse firmware data resides at VA `0x140262a10`. The selector at `0x140004d0f` through `0x140004d2e` chooses that address and length `0x1d4d4` when the updater object's mouse/dongle flag at offset `0x20` is zero. The other branch selects the 1K dongle image; that branch is not exposed here.

The mouse image includes this USB device descriptor at image offset `0x1d3cc`:

```text
12 01 00 02 00 00 00 40 10 37 01 34 17 10 01 02 00 01
```

It identifies VID `0x3710`, PID `0x3401`, and `bcdDevice 0x1017`. The website's release label is `1.0.1.7`; the configuration transport returns `00.00.10.17`. Both browser and independent native readback confirmed that raw value after the 2026-10-19 flash. The UI displays the zero-extended packed BCD value as `1.0.1.7` in labels and messages, while protocol comparisons and diagnostics retain the raw version. Unknown encodings are displayed unchanged. The official page and freshly downloaded package hashes were rechecked that day; `1.0.1.7` remained the latest firmware listed for the standard Xlite v4 Mini.

Local, ignored research artifacts are stored under `.local/firmware-research/`, including `official-xs1-evidence.json`, the official package, the extracted `candidate-3.bin`, and `xs1/updater.asm`. The hashes and offsets above make the extraction reproducible without committing vendor binaries.

## Interface selection

The native mouse device table at VA `0x1402afef0` contains the `3710:3401` entry:

```text
10 37 01 34 01 00 02 00
```

The row encodes VID/PID, DCDU protocol type `1`, normal-device state, and Windows interface number `2` (`MI02`). The same table includes bootloader `484d:0003` with DCDU type `1` and bootloader state. Enumeration at `0x140004100` uses that table and the interface-qualified device path. Bootloader selection follows the normal entry routine at `0x140004770`, specifically `0x140004978` through `0x1400049b3`.

The mouse image contains identical vendor report descriptors at image offsets `0x1a607` and `0x1a668`:

```text
06 ff ff 09 01 a1 01 15 81 25 7f 75 08 95 40
09 02 81 02 09 03 91 02 09 04 b1 82 c0
```

Both declare usage page `0xffff`, usage `1`, and unnumbered 64-byte input, output, and feature reports. The usage and report sizes alone cannot distinguish the updater and settings interfaces.

WebHID does not expose the Windows `MI02` path. The browser adapter therefore requires exactly two matching normal vendor interfaces and the exact device object that already passed the settings handshake. It selects the other interface, failing before transmission if this cannot be established. This selection and browser bootloader entry succeeded on the tested mouse on 2026-10-19. Keep only the target wired mouse connected throughout the flow.

After entry, the browser requires a separate user device selection for the new `484d:0003` identity and accepts exactly one matching interface with 64-byte report-ID-zero input/output reports. The live `USB Bootloader` descriptor captured in `.local/firmware-bootloader-ioreg.plist` advertises Generic Desktop / Undefined (`usagePage 1`, `usage 0`), which the selector now accepts. The vendor-defined usage-page alternative (`0xff00..0xffff`) remains supported but was not exercised by this device. This bootloader ID is shared by supported original XS1 mice and does not independently identify an Xlite v4 Mini. The user must select the same target mouse, including when resuming from bootloader mode.

## DCDU transfer sequence

All offsets in this section address the 64-byte payload. Native HIDAPI passes 65 bytes to `hid_write`: a leading zero report-ID byte followed by the payload. WebHID expresses the same transfer with `sendReport(0, payload)`. Flashing uses output reports and input-report acknowledgements, not the feature-report configuration transport.

Command payloads start with `44 43 44 55 00` (`DCDU` and a zero byte). Byte `5` is the command. Unused bytes are zero. Acknowledgements to commands `01`, `02`, and `03` must echo bytes `0..5` and return status `01` at byte `6`.

| Stage | Payload / response | Native evidence |
| --- | --- | --- |
| Enter bootloader on normal MI02 | `44 43 44 55 00 ff`, followed by zeros. The device re-enumerates as `484d:0003`; no command ACK is read. | `0x1400048a6` through `0x140004976`; identity selection at `0x140004978` |
| Erase | Command `01`; require matching ACK and successful status. | `0x140004d3d` through `0x140004e3c` |
| Set image length | Command `02`; bytes `6..9` contain `120020` as `d4 d4 01 00` (`u32LE`). Require matching ACK/status, then wait 10 ms. | `0x140004e78` through `0x140004f84` |
| Write image | Sequential raw 64-byte output payloads, with no DCDU header, block index, or per-block ACK. There are 1,876 payloads for this image. | `0x140004fb0` through `0x14000512a`; helper `0x140004530` with a null response pointer |
| Verify transfer | Command `03`; require matching ACK/status and a `u16LE` checksum at reply bytes `7..8`. | `0x14000513b` through `0x140005254` |
| Reboot | After a valid checksum, wait 10 ms and send command `04`. No reboot ACK is read. | `0x14000525a` through `0x1400052e5` |

The updater sums every byte of each transmitted 64-byte data payload, wrapping to 16 bits. The final payload contains only 20 new firmware bytes. Native `memcpy` at `0x140004fc8` replaces those bytes in the existing block buffer, leaving its final 44 bytes from the preceding block. Those retained bytes are also transmitted and included in the checksum. Therefore the expected wire checksum is `0xcf00`; the checksum of the 120,020 raw firmware bytes alone is `0xc902` and must not be substituted. Zero-padding the last payload would not reproduce the native transfer.

The browser implementation registers its input listener before sending each command, including when an ACK arrives before `sendReport` resolves. It additionally requires report ID `0` and a complete 64-byte response. Erase ACKs have a 10-second deadline; preparation/verification ACKs have a 1-second deadline; normal I/O has a separate bounded timeout. The erase deadline was extended after the live ACK took 4,945 ms, close to the previous 5-second limit; no automatic retry was added. These are browser adapter deadlines, not claims about guaranteed hardware timing. The native erase loop permits 5,000 empty reads with 1 ms sleeps; its preparation/verification loops permit 100 empty reads with 1 ms sleeps.

On rejected status, malformed/stale ACK, checksum mismatch, unexpected disconnect, abort, or I/O timeout, the implementation stops subsequent transmission and performs no automatic replay. A successful checksum and reboot dispatch are still not a successful post-update version check. The UI reconnects the normal settings interface and verifies the expected version before declaring the update confirmed.

The updater also contains a separate `23DG` path at `0x140005370` and firmware for other device types. Its commands and additional images are not used for the accepted `3710:3401` DCDU path.

## Verification boundary

`tests/firmware.test.ts` covers command fixtures, native final-block retention, checksum wrapping, strict ACK validation, interface ambiguity, permission filters, boot entry, cleanup, timeout, and abort behavior. State-machine tests use a synthetic image, including checksum refusal, disconnects, send failures and delayed completion; they run without vendor binaries. When the ignored official EXE exists at `.local/firmware-research/xs1/Pulsar_Updater_v1017_v125_T01.exe`, one additional test imports that real image and runs a complete 1,876-block transfer against a fake HID device, checking `0xcf00` and final command order. This additional test is skipped when the vendor EXE is absent.

Importer tests verify the accepted file sizes/hashes, rejection of modified or unrelated data, extraction boundaries, and isolation of validated bytes. The static review independently matched the implementation's packet order, length encoding, report framing, final-block handling, checksum, and reboot gate against the native assembly.

## 2026-10-19 live USB acceptance

The production flow in Codex's in-app browser on macOS (Chromium 155) completed the official `1.0.1.7` update. `.local/firmware-browser-live-20261019.json` records eight control/ACK events: boot entry, erase and its ACK, length and its ACK, checksum and its ACK (`00 cf` = `0xcf00`), then reboot. The raw firmware stream is intentionally omitted from diagnostics. Browser reconnection confirmed `00.00.10.17` and completed configuration readback; `.local/firmware-live-success-20261019.png` records the success UI.

Independent read-only comparison in `.local/firmware-live-verification-20261019.json` reports `ok: true`, comparing `.local/hardware-client-2026-10-19T03-53-16-690Z-backup.json` with `.local/hardware-client-2026-10-19T04-01-19-145Z-backup.json`. All six profile records, the active profile/available profile list, active performance settings, sleep/low-power settings, and the empty macro inventory were unchanged; version changed from `00.00.10.16` to `00.00.10.17`. The read-only backup did not switch profiles, so this does not establish every inactive profile's performance settings. An empty inventory also does not test preservation of nonempty macros.

This run verifies the browser's normal-interface selection, bootloader permission/re-enumeration, transfer checksum, reboot, and wired version/configuration readback for this mouse and image. Power loss, interrupted-update recovery, other images/models, and post-update 8K wireless reconnection/pairing were not tested. Simulated failure tests do not establish physical recovery behavior.
