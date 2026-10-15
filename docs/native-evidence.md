# Evidence from the native application

The extracted `Pulsar Fusion.exe` was statically decompiled using ILSpy. The Windows application was not executed. Decompiled reference files remain under `.local/decompiled/` and are not shipped with the web app. The source assembly hash and extraction chain are in `extraction.md`.

The principal evidence is `DriverPro/MainForm.cs`, `DriverCore.Model/SupportModel.cs`, and the protocol class `huAZ2tYGRX2LLl1Kis/QeugLfjKJdKnv2KrF5.cs`. The class names are obfuscated; many method names remain intact. Decompiled WinForms code contains warnings for missing external control references, so this document relies on straightforward assignments and method bodies rather than attempting to run the decompiled project.

## Xlite V4 capabilities and limits

The CSV column meanings are established by `SupportModel.GetListModels`, rather than inferred from position. Xlite V4 declares no right-side buttons, is not wired-only, and has no receiver product IDs excluded from LED support. The default sleep field is `15`, but it is only copied into model/UI state in the inspected code: that field alone does not establish the device's current timeout or the unit used by firmware.

| Setting | Native behavior | Evidence |
| --- | --- | --- |
| DPI | 50–32000, increments of 10 | `MainForm.InitDPIGrade`, lines 1862–1893; models with max DPI ≥30000 use step 10 |
| DPI stages | User choices 1–6; stage-count changes initialize values/colors from model CSV | `InitDPIGrade`; `pDvSnesWM6`, lines 6485–6523 |
| DPI stage defaults | 400, 800, 1600, 3200, 6400, 12800 | Xlite V4 CSV row |
| LOD | 0.7, 1, 2 mm for Xlite V4; writes mode 2 and distance ×10 | `InitDPIGrade`; `xdCSaJDiVq`, lines 4836–4880 |
| Debounce | 0–15 ms | `RefreshDebounceTime` overrides the designer's generic maximum at runtime; input clamps to limits |
| Sleep timeout | 30–900 seconds; 30-second choice followed by 1–15 minutes | `RefreshSleepTime`, lines 4659–4699; `gQlcJIdmEa` writes slider seconds directly |
| Low-power threshold | 5–100% | `RefreshPower`, lines 4630–4654 |
| Polling | 125/250/500/1000 Hz, plus 2000/4000/8000 only when receiver is tagged `8K` | `RefreshPollingRate`, lines 4883–4970 |
| Profiles | Query available IDs from device and select active hardware profile | `InitProfile`, lines 1840–1859; protocol `GetProfileIDList` |
| DPI LED | Off=0, steady=1, breath=2; brightness UI 0–100 maps to byte 0–255; speed byte=100−UI speed | `RefreshDPIEffect`/`ResetUIDPIEffect`, lines 6530–6660 |
| Macros | Native editor limit is 1000 event rows | Constructor `IgZLda7sS0=1000`; `CheckMacroMax` |

Profile count is not hardcoded by the native application. Profile names are displayed as `PROFILE {id}`. Although the shared translation file contains `EditProfileName`, no profile-name editing method is present in MainForm. The actual sidebar has profile selection, profile reset and factory reset. Likewise, the translation key for infinite sleep is not proof of an active infinite-timeout control in this version: the inspected sleep UI has a 30–900-second slider.

## Additional read and power protocol evidence

All byte offsets below refer to the **64-byte WebHID payload with the report-ID byte removed**. The native arrays contain 65 bytes; subtract one from every native source index. Packet status is payload byte 0, group byte 1, opcode byte 2, length byte 3; ordinary command data begins at payload byte 6.

| Feature | Group / opcode / length | Data and response |
| --- | --- | --- |
| Mouse firmware version | `01 / 87 / 04` | Response bytes 9,8,7,6, each hex-padded and joined with dots; native waits 100 ms |
| Receiver firmware version | USB descriptor | Native uses `HidDevice.ReleaseNumberBcd`, not a firmware write command |
| Available profile IDs | `02 / 82 / 10` | Response byte 6 count, IDs start byte 7 |
| Active profile read | `02 / 86 / 01` | Response byte 6 |
| Sleep read/write | `08 / 85 or 05 / 03` | `[profile, secondsLo, secondsHi]` |
| Low-power threshold read/write | `08 / 88 or 08 / 02` | Setter `[profile,percentage]`; native getter sends zero data and reads response byte 7 |
| Receiver LED read/write | `08 / 89 or 09 / 02` | `[profile,mode]`; mode 1=connection, 2=battery-warning-only; status 4 means unavailable |
| Debounce write | `04 / 03 / 03` | `[profile,value,0]`; native writes only one debounce byte |
| V4 LOD write | `07 / 02 / 03` | `[profile,2,7 or 10 or 20]` |

Receiver LED options are visible only for an `8K` receiver, additionally checking the model's no-LED product list. For Xlite V4 that exclusion list is empty. Wired devices and the `1K` receiver do not expose this receiver control in the native UI.

No firmware-update command was tested or implemented as part of this evidence inspection.

## Input notifications and connection quality

`MainForm.UCHomeDeviceItem_NTFUpdateMainUI` and `BgTmp_DoWork` decode native input report ID `5`. In WebHID, the report ID is delivered separately as `event.reportId`; the table below starts at `event.data[0]`.

| Notification opcode | Payload |
| --- | --- |
| `01` | Active profile in byte 1 |
| `05` | Active stage byte 1; current DPI bytes 2–3 little-endian |
| `07` | Charging byte 1 (`1`=charging), battery percentage byte 2 |
| `08` | Online byte 1 (`1`=online) |
| `0d` | Connection strength byte 1 |

`NotifyRssi` maps strengths 61–100 to Excellent, 41–60 to Good, 21–40 to Fair, and 1–20 to Poor. Five signal bars split at 20/40/60/80. This is an input notification, not a discovered periodic feature-report query. The native app opens notification HID collections separately; browser access to the matching report collection must be verified before claiming live RSSI support.

## Macro event and button encoding

`MainForm.GetFunctionID`, lines 4259–4286, maps the three visible playback modes:

- Fixed repeats: function `04`, arguments `[macroIdLo,macroIdHi,repeatCount]`.
- Repeat while held: function `05`, arguments `[macroIdLo,macroIdHi]`.
- Repeat until next press: function `06`, arguments `[macroIdLo,macroIdHi]`.

The event serializer `f8hSzE51ql` (lines 7890–8097) produces:

| Event | Bytes |
| --- | --- |
| Keyboard press/release | `[03,usage]` / `[04,usage]` |
| Modifier press/release | `[05,mask]` / `[06,mask]` |
| Mouse press/release | `[01,mask]` / `[02,mask]` |
| Wheel up/down | `[0b,01]` / `[0b,ff]` |
| Delay 0–255 ms | `[0c,milliseconds]` |
| Delay 256–65535 ms | `[0d,millisecondsLo,millisecondsHi]` |

Modifier masks: left Ctrl/Shift/Alt/GUI are 1/2/4/8, right Ctrl/Shift/Alt/GUI are 16/32/64/128. Mouse masks: left/right/middle/back/forward are 1/2/4/8/16. Keyboard usages use the USB HID keyboard usage table.

There are native serializer/parser disagreements for longer delays and pointer motion: the serializer emits decimal 34/35 for 24-/32-bit delays and 8 for movement, while the decoder switches on decimal 19/20 and 33 respectively. The longer delays are big-endian, as are signed 16-bit X/Y movement values in the serializer. These cases require further capture or firmware validation; they should not be silently guessed from this inconsistent source. Delays up to 65535 ms and key/button/wheel events agree between serializer and parser.

## Original visual layout and copied assets

The native WinForms client is 1440 ×810. Its main panels are 788 px high. The left navigation is 200 px wide at x=0, center content 1024 px wide at x=200, and right settings 216 px wide at x=1224. Left navigation items are 200 ×48 at y=163 (Home), 213 (Customize), 263 (Performance), 313 (Macro), and 363 (Power). The 128 ×43 company image is centered in a 197 ×60 control at (0,30).

Customize uses the original 471 ×565 annotated mouse image at page-relative (373,9). Performance fits the 309 ×565 image into a 404 ×495 control at (17,−11), preserving its ratio. The right profile selector is 166 ×31 at sidebar-relative (25,257); profile reset is at (25,318), factory reset at (25,393), both 166 ×33.

Native colors: accent `#0080ff`; panel fill `#fafafc`; main text `#6a6a6a`; headings `#303030`; border Gainsboro `#dcdcdc`; slider rail `#dedede`; selected text white. Most text uses Montserrat Medium 9 pt, with bold headings. Power cards use 20 px rounded corners.

Copied original assets for the local reproduction:

- `public/assets/xlite-v4.png`: original `Device.png` (309 ×565).
- `public/assets/xlite-v4-customize.png`: original `Device_Customize.png` (471 ×565).
- `public/assets/pulsar-logo.png`: original `CompanyName.png` (128 ×43).
- `public/favicon.ico`: original `Config/XliteV4/AppICO.ico`, with 16, 24, 32, 48, 64, 72, 96, 128 and 256 px variants.

These are byte-for-byte copies, not AI-generated replacements. They came from the supplied proprietary package and are intended here for the user's local reproduction; no publication or ownership claim is implied.
