# 1K / 8K receiver pairing: recovered official behavior

Investigation dates: 2026-10-18 (8K) and 2026-10-25 (1K extension and user acceptance). This record covers the original Pulsar 1K (`3710:5402`) and 8K (`3710:5403`) receivers. The initial 8K static investigation had no hardware and executed no USB commands. An 8K receiver subsequently became available for passive descriptor/feature reads and a production TypeScript routing check through a native adapter; those results are recorded below. The 1K extension was implemented from the official Xlite v4 pairing tool's recovered source and an existing native-adapter capture. After testing the new flow in the local development page, the user confirmed on 2026-10-25 (Asia/Shanghai) that real-device verification passed. No new raw 1K pairing capture was retained for this acceptance. The agent did not send hardware pairing commands. Vendor executables were downloaded, unpacked and decompiled, never run.

Current 8K acceptance with Xlite v4 Mini: the user confirmed pairing and subsequently confirmed DPI operation after the read-recovery fixes; browser connection and configuration reads passed. Configuration readback includes 8000 Hz, which is not a measurement of the actual USB report frequency. Receiver indicator mode 2 completed a full browser save; mode 1 was written and freshly read back, but the final complete settings snapshot timed out at `07/82`, so that save did not pass end to end. The last verified indicator mode is 1; hardware testing stopped before restoring mode 2. The user's later report that macOS desktop movement felt slower at 2000 DPI / 8000 Hz than at 1600 DPI / 1000 Hz remains unresolved. A fixed-DPI polling-rate comparison has not been completed. The user also confirmed the normal 1K browser pairing flow on 2026-10-25. This is user-reported hardware acceptance, separate from the earlier 1K configuration acceptance; it does not provide raw 1K pairing status events or separately verify each passive-routing branch. Raw pairing status frames and abnormal pairing/recovery paths still require separate evidence. See [verification.md](verification.md) for the dated hardware records and these boundaries.

## Official sources and reproducibility

The [official download page](https://www.pulsar.gg/pages/download) lists 8K Pairing Tool V0.11 (2024-10-24) and V0.12_all (2024-12-03). Its 8K section's download button currently resolves to the V0.11 archive. The same page's 4K eS pairing section links V0.12-all; that binary explicitly includes `5403:3710` in its supported IDs and defaults to this receiver. V0.12 is therefore additional direct evidence for the 8K path, despite the location of its download link.

| Artifact | Official download | SHA-256 |
| --- | --- | --- |
| V0.11 ZIP | [Pulsar_8K_Pair_v0.11.zip](https://www.pulsar.gg/cdn/shop/files/Pulsar_8K_Pair_v0.11.zip?v=18144765952964520615) | `14acfa48a79e555a51a544fef13b10988803b51fe53192c1e4796f0c5cd40e2d` |
| V0.11 `Pulsar_Pair.exe` | Inside the archive | `2c9d7cb2d55deb9825b652798f51a2c3da3559ef3a69bfc565982374b5811481` |
| V0.12 ZIP | [Pulsar_Pairing-V0.12-all.zip](https://www.pulsar.gg/cdn/shop/files/Pulsar_Pairing-V0.12-all.zip?v=6288539492894907449) | `ce3401d610814cd65ca92c6025ac61ead6c25299a7ae6593676123b6bc7a7bda` |
| V0.12 `Pulsar_Pair-V0.12.exe` | Inside the archive | `c412092680a43abb7132bd1c357922446068eb138064a478ab5202aafc74c959` |
| Xlite v4 / XS1 ZIP, retrieved 2026-10-25 | [pulsar_XS1_pair.zip](https://www.pulsar.gg/cdn/shop/files/pulsar_XS1_pair.zip?v=7763943151566861443) | `606debdb2a04c5e96b5803fde1528a1b7f17d18422573ab4beef3f470679eca0` |
| Xlite v4 / XS1 `Pulsar_Pair.exe` | Inside the archive | `5e9a0e2692f58e74ec175a8d64ad27aaf6fd8b31fa402882fc50e9f93719ec3c` |

On 2026-10-25 the official download page's **Pairing tool for X2 v3, X2H v3, X2A v3, Xlite v4** section linked the XS1 archive above. This provides a tool explicitly listed for the target mouse, in addition to the earlier 8K tool evidence.

Local, ignored evidence is under `.local/pairing/v011/`, `.local/pairing/v012/`, and `.local/pairing/xs1/`. All three are .NET applications. ILSpy 9.1 recovered the source using the existing local runtime, for example:

```sh
.local/dotnet-runtime/dotnet .local/ilspy/tools/net8.0/any/ilspycmd.dll \
  -p -o .local/pairing/v012/decompiled .local/pairing/v012/Pulsar_Pair-V0.12.exe
```

The recovered `Match/UsbTool.cs` and `Match/HID.cs` are byte-for-byte identical across all three decompilations. Their SHA-256 values are respectively `a2ba0e55059abb819e97cdf947b3c9a8700153017d885fbbdd9fd5845efcfac3` and `14c9f6be90895c6561ca02ebe8f2a2b6bdc5f404d42aadfd0f886a4b7082af74`. References below use `.local/pairing/v012/decompiled/` as their root unless stated otherwise. `Match/Program.cs:13` launches `Pulsar2`; this matters because the helper class also contains unused commands for other products.

## 1K extension: official call path and passive evidence

The XS1 decompilation under `.local/pairing/xs1/decompiled/` independently establishes that `3710:5402` uses the same active pairing protocol as the original 8K receiver. The following references use that root:

1. `Match/Program.cs:13` launches `Pulsar2`. Its `CheckPidVidInfo` at `Match/Pulsar2.cs:1004–1013` recognizes `5402:3710` and stores it as the receiver used by the active flow.
2. `Pulsar2.cs:1029–1088` calls `WriteAllUsbSoft` once, which starts pairing and treats initial status `02` as already paired. `Pulsar2.cs:1091–1099` passes the selected PID/VID to `WriteDgGotoPairModelByPidVid`.
3. The identical `UsbTool.cs:578–621` sends the same `48 4D 52 44 FC 24` output once, then reads native byte 7. The identical `HID.cs:400` and `457` choose `mi_02` for synchronous and overlapped input/output access.
4. `Pulsar2.cs:1102–1143` waits at most 30 seconds; native byte 7 values `03` and `04` mean success and failure. The output packet and report-ID-free status offset therefore remain unchanged for 1K.

The existing `.local/receiver-routing-20261015T202350Z.json` has SHA-256 `7c13642c4c5248e5a211d5b25cc8a8de946ef934f5b4ed11b98305355439ffaf`. Its passive section records **one** GET per interface, before the later settings queries:

| Interface | Captured passive result | Independent role evidence |
| --- | --- | --- |
| MI02 | Successful native size 2, including report ID; payload exactly one `00` byte (`:15–21`) | Official pairing tool selects `mi_02` |
| MI03 | Successful native size 65, including report ID; payload exactly 64 zero bytes (`:5–11`) | Subsequent polling queries return valid full settings replies (`:27–39`, `:48–60`); Fusion selects MI03 |

Both descriptors are the shared 64-byte input/output/feature layout below. For 1K only, the browser distinguishes a pairing candidate by an exact one-byte `00` payload and its sibling by either a valid settings report or an exact 64-byte all-zero payload; a 65-byte all-zero settings buffer is also accepted after removing its leading report-ID byte. It requires two matching role observations on each interface, exactly two complete candidates of the same supported PID, and no incomplete probe. Repeating the GETs twice is a conservative implementation safeguard; the original 1K capture does not establish repeated passive-read stability. An all-zero settings payload identifies only the route when paired with the complementary short response; it does not prove a settings transaction, paired mouse identity, or configuration readiness. Other short lengths, nonzero short reads, unknown status packets, and failed reads do not establish the 1K pairing route. Mixed 1K/8K candidates are rejected before probing or sending output. The 8K rule remains separate and does not accept zero-filled settings buffers or the 1K short response.

## Pairing interface and packet

Pairing uses a distinct vendor input/output HID interface, not the Fusion settings feature-report protocol. `Match/HID.cs:364–418` and `421–475` select the requested VID/PID, a Windows path containing `mi_02`, and input/output report lengths each at least 65 bytes. The code stores the descriptor usage page but never checks its value. It does not establish a specific usage page or usage suitable for a WebHID filter. Windows interface number is not a browser candidate index.

The earlier **1K** capture `.local/receiver-routing-20261015T202350Z.json` showed identical descriptors on interfaces 2 and 3. The later actual **8K** capture `.local/8k-passive-20261018T045508Z.json` confirms the same layout: `06ffff0901a1011581257f7508954009028102090391020904b182c0`, usage page `FFFF`, usage 1, and unnumbered 64-byte input, output and feature reports on both MI02 and MI03. This explains why a single receiver triggered the initial browser ambiguity rejection. Descriptor shape alone cannot identify the pairing interface; candidate ordering and sending pairing writes to every candidate are not valid substitutes.

`Match/UsbTool.cs:599–621` allocates a zeroed 65-byte Windows HID report and sets native bytes 1–6 to decimal `72,77,82,68,252,36`. Native byte 0 is the report ID, zero. The complete WebHID output is therefore `sendReport(0, payload)` with exactly 64 payload bytes:

```text
48 4D 52 44 FC 24 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
```

This is a source-derived request fixture, not a captured hardware packet. The first four bytes spell `HMRD`. There is no checksum, profile, Fusion command status byte or feature-report envelope in this output packet. `Match/ContorlUsbHander.cs:139–173` and `Match/HID.cs:516–545` trace the active call through Windows `WriteFile` / `ReadFile`, not `HidD_SetFeature` / `HidD_GetFeature`.

## Active pairing sequence

1. `Match/Pulsar2.cs:499–570` starts only after the user presses Pair, selects the receiver VID/PID, and invokes `WriteDgGotoPairModelByPidVid` once. V0.12's supported ID table is `Match/PidInfoList.cs:5`; the default is `3710:5403` at `Pulsar2.cs:21–23`.
2. `Match/UsbTool.cs:578–621` opens the synchronous pairing interface, writes the packet above, waits 50 ms, then reads one 65-byte input report. It takes native byte 7 as the result and closes the interface. In WebHID's report-ID-free payload this is byte 6.
3. If that first result is `02`, `Match/Pulsar2.cs:519–528` displays “Already paired”; `551–554` skips the subsequent wait. This is not fresh confirmation of the attached mouse model or of settings communication.
4. Otherwise `Pulsar2.cs:573–614` waits up to 30 seconds for input reports. Each native iteration opens an overlapped handle, waits 30 ms and reads. Status `03` at native byte 7 means pairing success, and `04` means pairing failure. All other values continue waiting. `UsbTool.cs:683–690` is the read helper. The active flow sends no polling/status command and never resends the start packet while waiting.
5. No stop/cancel output command exists in this active flow. On device removal, the UI sets a local end flag (`Pulsar2.cs` `WndProc`), which the waiting loop checks. A browser cancellation can stop listening and close its handle; it cannot truthfully claim to have cancelled the receiver's radio pairing mode.

`UsbTool.cs:693–723` contains an alternative helper that sends the same packet and polls with 120 ms waits, but `Pulsar2` does not invoke it. Do not combine that unused helper with the active flow and accidentally send start twice.

## What the source does not prove

- The native parser checks only native byte 7. It validates neither the input report ID, report header, checksum nor actual returned byte count. In particular, it does **not** prove that responses echo `48 4D 52 44 FC 24`.
- The output report ID is demonstrably zero. The later hardware capture establishes unnumbered 64-byte input descriptors, but no raw browser pairing input capture has yet confirmed the actual status framing. The native parser consumes a report-ID-prefixed buffer without inspecting byte 0.
- Native reads allocate 65 bytes, and interface selection requires at least that capacity. The user confirmed 1K and 8K browser pairing success, but no retained raw pairing input trace independently verifies the payload length and framing for either receiver. Rejecting malformed/truncated replies is a browser safety decision; stricter header/report-ID rules must be documented as implementation assumptions pending capture.
- The first native reply recognizes only `02`; the subsequent loop recognizes only `03`/`04`. There is no explicit acknowledgement value for “started,” and no basis to assign a specific meaning to values `00`, `01` or other values.
- Source-derived pairing completion must be followed by ordinary feature-interface identity validation (`3710:3401` for this app's Xlite v4), settings reads and useful readback before claiming that configuration is ready. `03` alone does not identify which compatible mouse paired.
- The normal 1K and 8K browser pairing flows have user confirmation on this unit. Hardware timing, raw status framing, permission/error variants, timeout recovery and replacement of an existing pairing have not been systematically verified. Automated fixtures can verify the implemented state machine but cannot establish these firmware facts.

## User preparation

The official download page requires only the target 8K receiver to be connected, with other receivers removed. `Match/Pulsar2.cs:965–1025` instructs the user to connect the receiver, disconnect the mouse from the computer, hold left click, right click and the scroll-wheel button together for three seconds, check for a blinking mouse LED, and then press Pair. Its button can be activated using Space or Enter (`1005` and the keyboard handlers), which is useful while the mouse is in pairing mode.

The XS1 tool gives the same preparation sequence but says to hold those three buttons for **five seconds** (`.local/pairing/xs1/decompiled/Match/Pulsar2.cs:324–374`); its one-dongle-only instruction is at `:440`. The observable endpoint is the blinking mouse LED. Browser guidance should allow this 3–5 second range rather than assume the two tools print the same duration.

The [official receiver product page](https://www.pulsar.gg/products/8k-dongle) lists Xlite v4 compatibility. That is evidence for this receiver generation, not for later LED 8K Gen.2/CrazyLight products. The implementation supports only original receivers `3710:5402` and `3710:5403`; other IDs remain outside its scope.

## Configuration after pairing

The existing native Fusion evidence remains separate: `.local/extracted/fusion/Config/my_models.csv:7` associates Xlite V4 with `5402;5403`, labels `1K;8K`, and settings interface `MI03`. `.local/decompiled/huAZ2tYGRX2LLl1Kis/QeugLfjKJdKnv2KrF5.cs:1228–1239` uses 65-byte native feature packets, defaults to a 30 ms initial response wait, and maps polling raw values 16/32/64 to 2000/4000/8000 Hz. `DriverCore.ViewModel/HomePageViewModel.cs:190–227` selects the 8K polling range using the receiver label/PID.

The settings identity read is category `01`, read register `84`, sub `04`; native `GetDevicePID` is at `QeugLfjKJdKnv2KrF5.cs:1472`. Firmware version read uses `01/87/04` with an explicit 100 ms wait (`1340–1371`). `GetWirelessConnectStatus` at `1409` sends `09/81/10` but returns `true` unconditionally, so its return value is not reliable evidence of pairing or connectivity. See [protocol.md](protocol.md) for the established settings protocol and receiver compatibility paths, and [verification.md](verification.md) for hardware acceptance boundaries.

The user subsequently reported that the browser displayed receiver pairing completion, followed by a timeout on the normal `01/84` identity query. Read-only capture `.local/8k-read-sequence-20261018T050158Z.json` showed valid identity bytes `10 37 01 34`, but category/register retained from the preceding response: `01/89` after polling, `02/86` after active-profile reading, and `08/81` after battery reading. Strict address matching discarded these replies. The connection handshake now accepts only the observed successful `01/89/04` identity variant after a fresh polling query, still validating checksum and Xlite v4 identity; general transactions remain strict. The indicator query has a similarly narrow compatibility path described in [protocol.md](protocol.md#receiver-and-reset-controls).

After these fixes, the production client completed a warning-free native-adapted read on the attached 8K receiver: `.local/hardware-client-2026-10-18T05-04-48-869Z.json`. It confirmed `3710:3401`, firmware `00.00.10.16`, profile 1, 1000 Hz, battery 70%, not charging, sleep 30 seconds, low-power threshold 10%, indicator mode 2, and an empty macro list. All 34 transmitted configuration packets were read requests. This historical checkpoint validated the repaired read path on hardware. Subsequent browser connection, DPI usage and indicator-write acceptance are recorded below and in [verification.md](verification.md); this read-only capture itself does not establish those results.

## Real-device passive routing check

On 2026-10-18, `.local/8k-passive-20261018T045508Z.json` recorded two `GET_FEATURE(0)` calls per interface, with no output or `SET_FEATURE` commands:

| Interface | Both passive reads |
| --- | --- |
| MI02, selected by the official pairing tool | Native read failure `IOHIDDeviceGetReport failed: (0xE0005000)` |
| MI03, selected by Fusion settings | 64-byte payload, status `05`, remaining body zero, checksum `0005` |

`.local/8k-route-check.ts` then imported production `resolvePairingInterface`, supplied the captured descriptors and performed fresh native reads on the attached receiver. Its adapter forbids both pairing output and feature writes. `.local/8k-route-check-result.json` records `ok: true` and `selectedInterface: 2`, with MI03 deliberately supplied first. This validates the resolver against real reads through the native adapter, not actual browser permission/error behavior. The adapter explicitly translates native GET failures to the Chromium transport error below.

[Chromium's `HIDDevice::FinishReceiveFeatureReport`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/hid/hid_device.cc) maps a failed feature read to `NotAllowedError` with the message `Failed to receive the feature report.`; the inspected local copy is `.local/chromium-hid-device.cc`. The [WebHID specification](https://wicg.github.io/webhid/index.html#dom-hiddevice-receivefeaturereport) specifies `NetworkError` for read failures. The resolver accepts those names only with that exact transport message. Neither error name identifies a USB interface or proves the underlying cause; it is used only with the complementary, repeated valid settings responses from this observed two-interface layout.

## Browser implementation and hardware acceptance

`src/receiver-pairing.ts` requests only VID/PIDs `3710:5402` and `3710:5403`, without assuming a usage-page filter in the permission picker. For the captured shared descriptor, it requires exactly two vendor candidates of the same supported PID, with 64-byte input/output/feature report 0. Mixed receiver types stop before probing. It opens and probes each sequentially, twice, then closes each. A valid settings response has 64 payload bytes (also allowing a leading zero report-ID byte), known status `01`/`02`/`04`/`05`, and a valid checksum. The two observed layouts use separate role rules:

- **1K:** exactly one interface returns the exact one-byte `00` payload on both GETs, while its sibling repeatedly returns valid settings reports or the captured 64-byte all-zero settings buffer. The zero buffer exception is limited to 1K route selection and never establishes mouse identity.
- **8K:** exactly one interface repeatedly returns the known feature-read transport failure, while its sibling repeatedly returns valid settings reports. All-zero settings buffers remain insufficient, and the 1K short response is not accepted.

Missing siblings, unknown layouts, inconsistent reads, generic errors, open failures, timeouts and cancellation stop before pairing output. The earlier single-candidate path remains only for an input/output interface with no feature report 0; this layout has not been observed on the captured units. The user confirmed the normal 1K browser pairing flow on 2026-10-25; raw browser probe logs and separate acceptance of every routing/error branch remain unavailable.

WebHID delivers input events asynchronously, so the browser installs the listener before sending once and waits in one bounded 30-second window. It does not reproduce the native 50 ms blocking first-read delay or repeated handle reopening. First valid status `02` means already paired; later `02` values keep waiting. Terminal `03`/`04` are accepted even if they arrive immediately, so a fast completion cannot be lost. This event-driven handling is an adaptation of the native status meanings. A failed or hanging `sendReport` cannot be converted into success by an early input event.

Only report ID 0 with exactly 64 input payload bytes is interpreted. Other input IDs and lengths from the selected vendor interface are still recorded in diagnostic logs for later descriptor/framing work. The UI bounds logs to 100 pairing entries and exports descriptors, passive probe results and the final result; it does not listen to ordinary keyboard/mouse collections. Cancellation, timeout, disconnect, failure and success remove listeners and close the pairing handle. No radio cancel or firmware command is sent.

After a reported completion, the app attempts configuration only through the other interfaces returned by that explicit selection, checks the Xlite v4 identity, and reads a fresh snapshot before advertising readiness. A failed configuration check returns to a disconnected state and offers a separate normal connection click for the selected 1K or 8K receiver; existing local drafts are retained. Success guidance reflects the selected receiver: 1K supports up to 1000 Hz, while 8K offers 2000 / 4000 / 8000 Hz. The user confirmed 8K pairing, and native-adapted and browser model verification/configuration reads pass on that unit. On 2026-10-25 the user also confirmed real-device verification of the new 1K flow in the local development page. That confirmation covers the normal flow; it does not establish all browser routing/error variants, raw pairing status framing, cancel/timeout behavior, other firmware versions, or a complete settings-write matrix.

A subsequent full reload of the local browser page successfully auto-connected the real 8K receiver and displayed its configuration (1000 Hz, active DPI stage 4 at 2000 DPI, debounce 0 ms, LOD 1.0 mm). Before reload the page still exhibited the previous client behavior despite updated UI text. Screenshot: `.local/8k-connected-browser.png`. This historical checkpoint verifies browser connection and settings reads for the current receiver; it does not itself validate high-rate or indicator-setting writes.

Later configuration captures confirmed 8000 Hz, and the user confirmed that DPI operation worked after the pending/stale-read recovery changes. That confirmation does not prove that a particular recovery branch was exercised on hardware, nor does the polling register measure actual USB report frequency. Indicator captures subsequently verified both mode values through fresh readback: mode 2 completed a full browser save, while mode 1 completed the power write/readback and then failed the final full snapshot at LOD query `07/82`. The unresolved macOS desktop speed report is recorded separately from these configuration results. The latest [verification records](verification.md) retain the exact operations, final indicator state and remaining tests.
