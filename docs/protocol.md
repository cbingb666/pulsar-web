# Xlite v4 Mini configuration protocol

Investigation date: 2026-10-15. The implementation targets `3710:3401` (cable) and receivers `3710:5402` (1K) / `3710:5403` (8K). Cable and 1K receiver communication have been verified on the user's Xlite v4 Mini; the 8K path remains source-derived and untested on hardware. Firmware-update, bootloader and pairing commands are not implemented. Reset dispatch and macro transfer are derived from the supplied native application and require explicit UI actions.

## Evidence and limits

The community implementation was inspected at commit [`f110422b52d7ef1e91d84ca02c4da512bf7dd06d`](https://github.com/packerlschupfer/pulsar-mouse-linux/tree/f110422b52d7ef1e91d84ca02c4da512bf7dd06d). It is primary evidence of that author's reverse engineering, **not a manufacturer specification**. The [Xlite v4 driver](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/xlite_v4.py) explicitly calls its X2A inheritance untested. Its claimed DPI range and LOD encoding do not match the present device. We do not copy those assumptions.

The USB descriptors and harmless read commands were subsequently checked against the user's connected Xlite v4 Mini (VID `3710`, PID `3401`) via macOS hidapi. Local capture: `.local/device-read.json` (not committed, generated from this device). Both vendor interfaces expose unnumbered 64-byte feature reports; the settings interface is identified by a matching polling-rate response, not a guessed display name. Live browser permission and write/readback acceptance remain separate tests.

Hardware reads confirmed polling rate, debounce bytes, sensor toggles, full DPI block, stage colors, LOD, LED brightness/effect, button IDs, battery/charging, sleep and low-power threshold. A read match establishes format; it does not prove every possible value is supported. The native application was subsequently decompiled, establishing macro transfer and active-profile switching. Firmware update remains outside the implemented transport; destructive reset APIs are implemented from native source but have not been executed during this investigation.

## Packet envelope

Derived from [X2A source](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/x2a.py), verified by actual replies:

| Bytes | Meaning |
| --- | --- |
| 0 | Request `00`, pending `02`, complete `01` |
| 1 | Category |
| 2 | Register; bit 7 set for a read |
| 3 | Sub-register / declared body length |
| 4–5 | Zero |
| 6 | Profile 1–6; zero addresses active/global context, or carries response data |
| 7–61 | Payload |
| 62–63 | Little-endian sum of bytes 0–61 |

USB HID Feature report ID is **0**. WebHID `sendFeatureReport(0, packet)` receives 64 payload bytes, without an extra ID prefix. Native hidapi prepends a report ID byte; do not transfer that convention into browser packets. The browser transport tolerates a 65-byte response only when the first byte is zero, otherwise requires exactly 64 bytes. [WebHID specification](https://wicg.github.io/webhid/)

The 1K receiver's two vendor interfaces advertise the same descriptor, but a passive GET on the attached receiver returned a 64-byte payload on interface 3 and a one-byte payload on interface 2. Before sending any command to a `5402` candidate, the client now checks its passive response length with a deadline. Short/invalid reports are skipped. A valid length, including an all-zero packet, is only a routing check: fresh polling and paired-identity requests are still required. No browser candidate position is assumed to be a USB interface number.

Commands are serialized. After one SET_FEATURE, poll GET_FEATURE every 20 ms for at most 1.2 s; do not resend a pending request. Match completion status, category, register, nonzero profile, and command-specific stage/button discriminator. Verify checksum before using a reply. The DPI bulk response legitimately changes sub-register `15` to `21`, so sub is not universally compared. Timing and stale replies are documented in the [1K dongle driver](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/xlite_v4_wireless.py) and [8K transport](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/feinmann8k.py).

A matching, checksum-valid status `05` is terminal, not pending. Native `MainForm.cs` lines 613 and 7535 mark the device offline for this status; the web client reports that the receiver did not receive a mouse response without retrying the command. It does not infer whether sleep, pairing, power or another link issue caused it. USB-level SET_REPORT failure is a separate transport error.

## Registers

Register column shows write address; read adds `80`. All numbers in the first three columns are hexadecimal. Source: [X2A command methods](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/x2a.py), with Fusion2 exceptions cited below.

| Category | Register | Sub | Context | Payload / response |
| --- | --- | --- | --- | --- |
| 01 | 04 | 04 | 0 | Paired mouse VID u16LE at bytes 6–7, PID u16LE at bytes 8–9; receiver must report `3710:3401` |
| 01 | 09 | 02 | 0 | Byte 7 = Hz / 125; 1,2,4,8 for cable/1K |
| 04 | 03 | 03 | 0 | Byte 7 debounce; native setter clears reserved byte 8 (read currently returns 3,3) |
| 07 | 04 | 02 | 0 | Byte 7 angle snapping boolean |
| 07 | 03 | 02 | 0 | Byte 7 ripple control boolean |
| 07 | 05 | 02 | 0 | Byte 7 motion sync boolean |
| 07 | 02 | 03 | profile | Bytes 7–8 = selector 2, LOD × 10 |
| 05 | 04 | 15 read / 21 write | profile | Active stage, count, then five-byte stage records |
| 05 | 01 | 02 | profile | Byte 7 active stage, one-based |
| 05 | 05 | 05 | profile | Stage ID, R,G,B |
| 03 | 03 | 03 | profile | Selector 1, brightness (0–255) |
| 03 | 04 | 0F | profile | Selector 1; effect at byte 8; breathe speed byte 11; preserve unknown bytes |
| 04 | 01 | 06 | profile | Physical ID, function type, arg1, arg2; read payload ID,FF |
| 08 | 01 | 01 | 0 | Battery percent at byte 6 |
| 08 | 03 | 01 | 0 | Charging boolean at byte 6 |
| 08 | 05 | 03 | 0 | Sleep seconds uint16 little-endian at bytes 7–8 |
| 08 | 08 | 02 | 0 | Low-power percent at byte 7 |

Power field derivation and seconds units: [Fusion2Power implementation and its capture notes](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/xlite_v4_wireless.py). User's cabled mouse returned battery 88%, charging 1, sleep 30 seconds and low-power 10%. These are observed values, not factory defaults. Power reads are optional; failure is surfaced in snapshot warnings.

LOD uses the newer Fusion2 form from the [8K LOD capture](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/feinmann8k.py): selector `02`, raw value in tenths of mm. This device returned `02 0A`, i.e. 1 mm. Never apply the older X2A `[0,0]` / `[1,1]` encoding to this mouse. The official Xlite guide names 0.7, 1 and 2 mm; intermediate tenths come from sibling Fusion2 source and still need model-specific hardware confirmation.

DPI record: `[stage ID, X low, X high, Y low, Y high]`. Values are **direct DPI**, not units of 100. Actual read returned active stage 3 and six stages 400/800/1600/3200/6400/12800. The native `GetDPIStageInfo` (2135) reads the bulk block, then separately queries `05/81/02` for the actual active stage. The client follows that sequence and validates the independent stage against the stage count instead of relying only on the bulk block's byte 7. Official model guide specifies 50–32,000 and increments of 10. Preserve each axis independently. [Model-specific manual](https://www.pulsar.gg/cdn/shop/files/Manual_Xlite_v4_Quick_Guide.pdf?v=13613901784141965113)

Physical button IDs 1/2/3/4/5/11 were read successfully. Native `Device.ButtonID` and `MainForm.GetButtonID` establish left/right/wheel/**back/forward**/DPI, correcting the community implementation’s reversed 4/5 labels. Function encodings: mouse=1; keyboard=2 (`arg1` modifier bitmap, `arg2` HID key usage); scroll=3; DPI=9; consumer=13 (little-endian usage); double click=14; disabled=0. Preserve unrecognized bindings until explicitly edited. [Shared HID tables](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/hid.py)

## Implementation / acceptance rules

- Opening/reconnecting a device performs read commands only and never flushes saved drafts. Explicit edits to performance controls use the single-field immediate-settings path; numeric inputs commit after editing and sliders at gesture completion. Other controls remain local until Apply.
- Immediate edits are built from device readback, never from the whole editable draft. Check the current profile and relevant device settings before writing; external changes require a refresh. Merge only the requested field back into the workspace so pending bindings, imported layouts, colors and other drafts remain uncommitted.
- Validate an entire batch before the first write. Do not overwrite unchanged fields.
- Match the native debounce setter (value then zero); preserve unexposed LED bytes.
- Wait for write completion, then read back settings and reject mismatches.
- Keep local profiles/macros distinct from device-stored settings; device save is explicit and verified.
- Failed writes may leave a partial batch on the device; reload and display actual settings, never report success after an exception.
- Transport tests cover actual recorded packets, malformed data, busy/stale replies, checksum rejection, transaction serialization and disconnect cancellation.

## Attribution

`src/protocol.ts` and `src/hid.ts` are new TypeScript implementations informed by the MIT-licensed project's protocol facts and source. The upstream license is reproduced in `THIRD_PARTY_NOTICES.md`.

## Native Fusion 1.0.5.4 recovery

The supplied Inno installer contains a 7z self-extracting payload, which contains the .NET executable `Pulsar Fusion.exe`. ILSpy 9.1 produced local source under `.local/decompiled`; no original executable or decompiled implementation is shipped. The two UI image assets retain their original ownership as described in the README. See `docs/extraction.md` for hashes and extraction details.

The concrete protocol implementation is `.local/decompiled/huAZ2tYGRX2LLl1Kis/QeugLfjKJdKnv2KrF5.cs`, a subclass of `DriverCore.Model.FWProtocolBase`. Its arrays contain a leading report-ID byte, so all native offsets below are translated by subtracting one. This source directly confirms the envelope, profile commands, LOD, power, LED, macro chunking and debounce setter. The web implementation is newly written from the recovered packet behavior.

Native `GetProfileIDList` (line 1437) sends category 2/register 82/sub 10; response byte 6 is count and bytes 7 onward are IDs. **The actual Xlite v4 Mini returned six profiles [1,2,3,4,5,6]**, overriding the community driver's assumed five. `GetProfileID` (3050) uses 2/86/1 and byte 6. `SetProfileID` (3078) writes 2/06/1 with the target in byte 6 and waits 500 ms. The browser follows this settle time and validates readback; applying a whole snapshot requires its target to be the actual active profile so settings addressed through profile zero cannot land on a different profile.

`GetDeviceFirmwareVersion` (1340) reads 1/87/4 and formats bytes 9,8,7,6 as two-digit hex components. The attached mouse returned `00.00.10.16`.

`SetDebounceTime` (3249) writes only profile and value; the subsequent byte stays zero. Accordingly the web setter emits `[debounce,0]` and does not interpret the second response byte as an independently adjustable release delay. `SetLiftOffDistance` (3310) confirms selector 2 and raw tenths for the v4.

### Macro storage

All macro commands use category 6 and a body beginning at byte 6. In this category byte 6 is **not a profile**: it is the first byte of a macro ID or list count. IDs, sizes, offsets and name lengths are little-endian. The desktop application uses 50-byte chunks and UTF-16LE names.

| Operation | Register / sub | Body / response |
| --- | --- | --- |
| Count | 81 / 01 | Response byte 6 count |
| List | 82 / 38 | Request total u16, entry offset u16; reply total u16, offset u16, then up to 26 u16 IDs |
| Size | 83 / 06 | ID u16; reply ID u16, size u32 |
| Allocate | 03 / 06 | ID u16, exact byte size u32 |
| Name read | 85 / 3A | ID u16, byte offset u16, length u16; response name data begins byte 12 |
| Name write | 05 / 3A | ID u16, offset u16, total byte length u16, UTF-16LE bytes |
| Data read | 86 / 06+length | ID u16, byte offset u32; response data begins byte 12 |
| Data write | 06 / 06+length | ID u16, offset u32, data bytes |
| Delete | 04 / 02 | ID u16 |

Read name once to learn length, then request offset zero with that length (do not assume the first length query also contains all data). Match macro ID and offset to reject stale chunk replies. The browser bounds raw data to 4096 bytes and names to 25 UTF-16 code units, validates before allocation, writes data/name, and reads the entire saved object back. Existing IDs are touched only by an explicit save/delete. The initial inventory was empty. Subsequent hardware tests created a temporary 120-byte macro, verified its full contents and name, then deleted it; see the [verification record](verification.md).

Native `MainForm.GetFunctionID` maps macro playback to button type 4 (repeat count in third argument), type 5 (while held), type 6 (toggle). Arguments 1/2 carry macro ID low/high. The TypeScript binding includes optional `a3` so repeat count is not silently lost. Event-byte encoding is documented and tested separately in `src/macro-codec.ts`.

### Receiver and reset controls

`Config/my_models.csv` associates Xlite V4 with `5402` and `5403` receivers. The latter enables rates 2000/4000/8000 Hz, encoded as 16/32/64 at the same polling register. `PulsarHidClient.maxPollingRate` and complete-batch validation reject rates above 1000 on cable or a 1K receiver. The high-rate receiver path has not been exercised on hardware here.

Native `GetDevicePID` (1472) reads category 1/register 84/sub 4. The 1K receiver returned `10 37 01 34` at payload bytes 6–9, identifying the paired mouse as `3710:3401`. Receiver USB IDs are shared across models, so the connection handshake checks this identity before allowing configuration; a successful polling query alone does not establish the mouse model.

Native `GetDongleIndicator` / `SetDongleIndicator` (3893/3930) use category 8/register 89 or 09/sub 2 with mode at byte 7: 1=connection, 2=battery warning. A device status byte 4 means unsupported. The native UI exposes this only for the 8K receiver; indicator reads and writes are restricted to PID `5403`.

Native `ResetProfile` (2251) sends category 2/register 05/sub 1/target profile. MainForm (4563) waits 500 ms then activates that same profile; `resetProfile` follows this sequence and reads the resulting configuration. It is a destructive action and was not exercised in development.

Native `Default2` (2277), used for this model by MainForm (4589), sends category 1/register 0C/sub 1 with body byte 2, then waits without GET_FEATURE. `requestFactoryReset` dispatches that command and closes the connection after 2 seconds. Its return means dispatch finished, not readback-verified restoration; the user must reconnect. No factory reset was performed.

### Notifications

MainForm (2344–2410) receives report ID 5 from a separate notification HID interface. WebHID payload excludes the report ID: opcode 1 + profile; opcode 5 + one-based stage + DPI u16LE; opcode 13 + signal percent; opcode 8 + online flag; opcode 7 + charging + battery percent. `parseInputReport` implements this layout and rejects truncated/out-of-range data. It is not automatically attached to the generic keyboard/system collection because browser protection may prevent access; the wired UI must not invent a signal strength when none is available.
