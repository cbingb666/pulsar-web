<!-- source: docs/macro-protocol.md; source-sha256: 5e4c4a337b71bc61d1a3326b48fd532eae27f1f6582db8863132d207af4c7b63 -->

# Native macro encoding evidence

[中文（规范源）](../macro-protocol.md) · [English](macro-protocol.md)

> English translation of the linked Chinese canonical source. Chinese prevails if wording differs.

Source: user-supplied `PulsarFusionDrvSetup_Ver1.0.5.4.exe`, extracted managed assembly and decompiled into `.local/decompiled/`. No packet writes were performed to derive this codec. The transport layer handles category 6 separately.

## Event stream

`DriverPro/MainForm.cs`, method `f8hSzE51ql` (around lines 7890–8100), serializes the list directly with no stream header or terminator. `rn7S0ocQy7` (around lines 7270–7450) parses it. `IgZLda7sS0 = 1000` (line 1610) limits the native UI event count.

| Event | Bytes |
| --- | --- |
| Keyboard down / up | `03 keycode` / `04 keycode` |
| Modifier down / up | `05 mask` / `06 mask` |
| Mouse down / up | `01 mask` / `02 mask` |
| Wheel up / down | `0B 01` / `0B FF` |
| Delay 0–255 ms | `0C ms` |
| Delay 256–65535 ms | `0D low high` |

Keyboard values come from `hj77R4ovCABOvece7H/KDLoSFJ1tZc2p1kSIM.cs`, methods `aceaRr3Y4h` and `eCHaZ05odA`, rather than treating browser keyboard numbers as native codes. Modifier masks are defined in `DriverCore.Model/Device.cs` and `MainForm.GetModifierKeyFromString`: left Control/Shift/Alt/GUI = 1/2/4/8, right = 16/32/64/128. Mouse masks are left/right/middle/back/forward = 1/2/4/8/16; DOM button order differs for right/middle.

The codec preserves the total duration of longer local delays by splitting them into multiple supported <=65535 ms events. It checks the expanded native event count against 1000.

## Explicitly unresolved native inconsistencies

- Native writer emits decimal `34/35` for 24/32-bit delays, but native reader recognizes decimal `19/20` instead. The web codec does not guess which firmware supports which variant; it splits writes into unambiguous u16 delays and rejects those ambiguous encodings on import.
- Native movement writer uses opcode decimal `8`; its reader recognizes decimal `33`. Signed decoding in that branch is also unusual. These streams are rejected with a specific error rather than silently losing events.
- The native mouse-up reader reuses the previous mouse-down button even though the writer stores the button mask. The web codec honors each explicit byte and does not reproduce that apparent UI parsing bug.
- Combined mouse/modifier masks, unknown keyboard codes and non-unit wheel values are rejected until independently verified.

## Loop behavior belongs to button bindings

`MainForm.GetFunctionID`, around lines 4250–4290, assigns:

| Local mode | Native function | Parameters |
| --- | --- | --- |
| once | 4 | macro ID little-endian u16, count 1 |
| repeat | 4 | macro ID little-endian u16, count 1–255 |
| whilePressed | 5 | macro ID little-endian u16 |
| toggle | 6 | macro ID little-endian u16 |

Semantics are confirmed by `.local/extracted/Language-XliteV4.utf8.ini` keys `MacroITips`, `MacroIITips`, `MacroIIITips` (Chinese lines 110–112, English 276–278). Loop configuration is not embedded in the macro byte stream. A macro imported from device storage alone therefore has no knowable loop mode until a corresponding button binding is inspected.

## API

`encodeNativeMacro({events})` produces `number[]`; `decodeNativeMacro(data)` produces `MacroEvent[]`. `macroBinding(id, {loopMode, repeatCount})` returns a binding compatible with the HID client's `ButtonBinding`. `decodeMacroBinding(binding)` recovers the ID and playback behavior.

These functions perform only in-memory transformations. Device storage, available memory, name limits, write/readback verification and UI upload status are the transport and application layers' responsibility. Unit tests use explicit byte fixtures derived from the native branches, and exercise malformed streams and boundary conditions. Hardware behavior remains a separate acceptance check.
