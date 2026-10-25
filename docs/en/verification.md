<!-- source: docs/verification.md; source-sha256: e079294b858c38ea83036299e30fbabc885f934e9fb45cf288e687a954dbd31e -->

# Verification records

[中文](../verification.md) · [English](verification.md)

## 2026-10-25: 1K browser pairing passed on hardware

After adding Web pairing for the original `1K Dongle` (`3710:5402`), the user tested the local development page and confirmed that real-device verification passed. The normal 1K flow therefore changes from pending hardware verification to user-confirmed hardware acceptance. This is separate from the earlier 1K wireless configuration read/write acceptance.

Pairing reuses the command recovered from the official Xlite v4 / XS1 tool, identifies the interface from this model's passive-read evidence before sending, and still requires Xlite v4 identity validation and a settings read before advertising readiness. 1K remains limited to 1000 Hz; 8K retains its existing routing rules. See [pairing evidence](receiver-pairing-evidence.md).

This confirmation included no new raw HID capture, passive logs or status frames. It does not establish every routing branch, cancellation, timeout, removal recovery, other firmware, or every configuration write. At implementation completion, 112 targeted pairing tests, all 410 `npm test` tests and `npm run build` passed. Full output is in `.local/1k-pairing-tests.txt`.

## 2026-10-19: browser USB firmware upgrade passed on hardware

With user authorization, this Xlite v4 Mini completed the official XS1 `1.0.1.7` upgrade through the production page in Codex's macOS in-app browser (Chromium 155), changing `00.00.10.16` to `00.00.10.17`. The [official download page](https://www.pulsar.gg/pages/download) was checked again that day; `1.0.1.7` remained the latest listed version, and newly downloaded ZIP/EXE hashes matched the allowlist.

- `.local/firmware-browser-live-20261019.json` records eight control/ACK events: boot entry, erase/ACK, length/ACK, verification/ACK and reboot. The device returned `0xcf00`; the firmware stream is intentionally omitted. Reconnection read the new version and settings; screenshot `.local/firmware-live-success-20261019.png`.
- Erase ACK took 4,945 ms, near the former five-second deadline. The browser erase limit was subsequently raised to ten seconds; other ACKs remain one second and are never automatically resent. Mock-clock tests cover a six-second ACK and the ten-second deadline. This timing change was not followed by another hardware flash.
- `.local/firmware-bootloader-ioreg.plist` identifies actual `484d:0003` as `USB Bootloader`, `usagePage 1 / usage 0`, with report ID 0 and 64-byte input/output. The picker accepts this observed collection and retains a vendor usage-page alternative, not exercised on this device.
- Independent read-only comparison `.local/firmware-live-verification-20261019.json` reports `ok: true`. Backups `.local/hardware-client-2026-10-19T03-53-16-690Z-backup.json` and `.local/hardware-client-2026-10-19T04-01-19-145Z-backup.json` match six profile records, active/available profiles, active performance, sleep/low-power and empty macros; version changed to `00.00.10.17`. The backups neither switch profiles nor write settings, so they do not establish all inactive performance settings or nonempty-macro preservation.

Acceptance covers only this mouse, official image, complete browser USB update and reconnection. Power-loss/interruption recovery, other models/versions and post-update 8K reconnection/pairing were not tested. See [firmware evidence](firmware.md).

Software checks: TypeScript/Vite build passed; 67 targeted firmware/file-validation/two-group 8K regression tests passed (`.local/firmware-live-targeted-tests.txt`). Full and serial runs encountered short-deadline timeouts in 8K indicator/identity tests, later passing targeted reruns; neither full run was recorded as wholly passing. Original results remain in `.local/firmware-live-final-tests.txt` and `.local/firmware-live-serial-tests.txt`.

Before commit, HID lifecycle, protocol short-timeout, receiver identity/indicator and pairing tests adopted mock clocks while retaining deadlines, packets, cleanup and no-retry assertions, removing machine scheduling from simulated-device deadlines. All 369 `npm test` tests and `npm run build` subsequently passed (`.local/firmware-precommit-tests.txt`). Two optional official-file checks ran locally and are skipped in CI without vendor files.

### Earlier that day: implementation complete, no hardware flash yet

This preserves the pre-upgrade checkpoint; statements saying untested describe that earlier state and are supplemented by the successful record above.

An experimental wired USB entry for Xlite v4 Mini `3710:3401` was added under Power. It accepts the official XS1 `1.0.1.7` updater or an extracted image with the identical hash, and implements file validation, separate bootloader transport, staged authorization, transfer checks and reconnect/version verification. Source, assembly addresses, framing and checksums are in [firmware evidence](firmware.md).

- The updater was extracted statically only. Browser file import, target version, 120,020-byte image and SHA-256 display were verified; Start stayed disabled until confirmation. Screenshot `.local/firmware-import-preview.png`.
- Simulated transfer covered command order, retained final bytes, checksum, mismatched/missing ACKs, timeout, removal, unmount abort and late I/O. The real official image completed 1,876 packets on a fake HID and produced `0xcf00`.
- Normal settings open/close/cleanup gained deadlines; disconnect/disposal invalidates old connections, and unreleased handles cannot pass to flashing.
- **No boot-entry, erase, firmware data or reboot command had been sent to hardware at this checkpoint.** Interface selection, bootloader descriptors, USB re-enumeration, device acceptance, version readback and power-loss recovery had not been hardware-tested. Automated success is not hardware flashing acceptance.

## 8K acceptance checkpoint · 2026-10-18

An original 8K Dongle (`3710:5403`) was attached for Xlite v4 Mini hardware verification. The user confirmed pairing and, after read-recovery fixes, usable configuration and DPI operations. Both the production TypeScript client and browser completed reads.

| Item | Result at this checkpoint |
| --- | --- |
| Pairing/settings routing | Read-only MI02/MI03 distinction verified; user confirmed pairing and subsequent browser connection/read |
| Full configuration and DPI | Native adapter and browser completed reads; user confirmed restored DPI operation. Pending/stale-completion recovery boundaries are simulated, not a claim that every intermittent cause is known |
| 8000 Hz configuration | Full hardware read passed; no actual USB frequency measurement, every-rate write/readback or long-term comparison |
| Indicator mode 2: low-battery only | Browser write, target readback and complete page save passed |
| Indicator mode 1: connection status | Write, indicator and active-profile readback passed; final full snapshot timed out on LOD `07/82`, so the page save did not fully pass |
| Battery `255` | Special unavailable reading, retaining valid power settings; neither false 0% nor proof of sleep/offline |
| Automated checks | 34 targeted indicator-write tests, all 331 `npm test` tests and TypeScript/Vite build passed |

Last verified device state: stage 4, X/Y 2000 DPI, configured 8000 Hz, indicator mode 1. Hardware work stopped after the user questioned pointer-speed changes; original mode 2 was not restored. The user later reported 2000 DPI / 8000 Hz felt slower on macOS than 1600 DPI / 1000 Hz. The cause remains unknown, without a fixed-DPI rate comparison or confirmed pointer-acceleration/8K-processing cause. This checkpoint only organized existing evidence and performed no further device operations.

Dated evidence follows. Older unverified statements describe their original checkpoint. `.local/` captures, screenshots and original tools are excluded from commits/builds.

## 2026-10-15: environment and evidence levels

- macOS ARM64; actual `Pulsar Xlite v4`, VID:PID `3710:3401`, user model Xlite v4 Mini.
- Settings USB interface 3, usage page `ffff`, report ID 0, 64-byte Feature. The other identical-descriptor interface cannot be distinguished by descriptors alone; the client uses a read-only handshake.
- Firmware `00.00.10.16`; six profiles; initial profile 1, DPI stage 3, 1000 Hz, 3 ms, LOD 1 mm.
- Windows executables were only statically extracted/decompiled, never run in Windows.

## Actual USB writes, readback and restoration

The first group used `scripts/hardware-smoke.py --write-test`. Every test saved raw reports, read each change back, restored and read again. All passed; final configuration fields matched backup.

| Test | Actual change | Result |
| --- | --- | --- |
| DPI | Inactive stage 1 X 400→410→400, preserving Y/active stage | Pass |
| Polling | 1000→500→1000 Hz | Pass |
| Debounce | 3→4→3 ms, restoring the full raw field | Pass |
| Ripple | Off→on→off | Pass |
| LOD | 1→0.7→1 mm | Pass |
| LED effect | Off→steady→off, preserving other fields | Pass |
| Color | Inactive-stage red +1, then restore | Pass |
| Side button | Button 5 forward→back→forward | Pass |

Evidence `.local/hardware-smoke.json`; raw backup `.local/hardware-smoke-backup-20261015T121950.929497Z.json`.

The second group imports production `src/hid.ts`; Python only adapts system HID I/O, without reimplementing protocol. It tests the application's actual TypeScript client, not browser permission end to end.

| Test | Actual operation | Result |
| --- | --- | --- |
| Multipart macros | Create temporary 120-byte, three-packet macro with a UTF-16 Chinese name, full readback, then delete | Pass |
| Profiles | 1→6→1; explicitly address slot 6 ripple and restore | Pass |
| Power | Sleep 30→60→30 seconds; threshold 10→15→10% | Pass |
| Macro binding | Bind delay-only macro to button 5; verify macro-I repeat field; restore and delete | Pass |

Full evidence `.local/hardware-client-2026-10-15T12-32-49-224Z.json` and `.local/hardware-client-2026-10-15T12-36-32-518Z.json`. Both final settings/macro lists matched initial state and had empty `restorationErrors`. The delay-only binding injected no keyboard/mouse inputs into user applications.

The first native-client macro test found leading empty device-list slots. Parsing was fixed with a real-packet regression test. Even the failed run cleaned its temporary macro and restored settings; it was not marked passing.

## 1K receiver wireless configuration

The user confirmed wireless cursor motion via `1K Dongle` (`3710:5402`). Settings remain on interface 3 Feature Report 0. Paired identity `01/84/04` returned `3710:3401`. An initial macOS `IOHIDDeviceSetReport failed (0xE0005000)` USB STALL recovered after closing other configuration sessions and reinserting; those two factors were not independently isolated.

Actual verification used the production TypeScript client and default transport timeout:

```sh
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --product-id=0x5402 --write-test --bind-side
```

| Test | Actual operation | Result |
| --- | --- | --- |
| Full read | Model, six slots, DPI/buttons/sensor/lighting/power/firmware | Pass |
| DPI / polling | Inactive stage 1 X 400→410→400; 1000→500→1000 Hz | Pass |
| Macro storage/binding | Upload 120-byte delay macro, full readback, bind button 5, restore/delete | Pass |
| Profiles | 1→6→1; temporary slot-6 ripple change and restore | Pass |
| Power | Sleep 30→60→30 seconds; threshold 10→15→10% | Pass |
| Restoration | Original active slot, full settings, sensor toggles, power and macro inventory | All match |

Evidence `.local/hardware-client-2026-10-15T13-22-09-907Z.json` and its `-backup.json`. `ok: true`, no restoration errors; stage 3 and all three user-enabled sensor toggles were retained. 1K sends no 8K-only indicator query.

An earlier `.local/hardware-client-2026-10-15T13-18-10-351Z.json` (about 21:18 Beijing) ended with bulk stage 6 instead of backup stage 3, so it was not a complete pass. The user later confirmed pressing DPI or changing settings during that run. The change is consistent with manual intervention; it is not evidence of an unsolicited program change or retrospectively a pass. A later read-only check returned 3 in both bulk and dedicated stage registers; the successful full rerun is above.

Native `GetDPIStageInfo` queries `05/81/02` after bulk; the client now follows that sequence with tests. This follows native reads and is not described as a fix for the manual-intervention event.

## Automated checks

`npm run build`: TypeScript and Vite production build passed.

`npm test`: 98 tests passed, covering real packets, checksum, error/stale responses, timeout/serialization, full pre-write validation, mismatched readback, left-click retention, profile drift, macro chunking/names/repeats, empty slots/paging, JSON/native CSV, corrupt-profile isolation/drafts, paired identity, 1K/8K limits and independent active-stage bounds.

## Immediate-setting interaction verification

Browser actions used the real React page and an isolated fake HID client on `127.0.0.1:5174`, without real devices. This verifies UI events, commit timing and state, not real WebHID permission end to end.

- Polling clicks wrote only polling; unapplied lighting stayed in drafts and device lighting remained unchanged.
- Typing DPI wrote nothing; Enter submitted once. Releasing the debounce adjustment key committed without duplicate saves.
- With axes linked, focus/blur without editing X did not overwrite a differing Y.
- Simulated failure paused immediate writes; later LOD changes stayed drafts. Changes during disconnection did not auto-write on reconnection.
- Removing then adding a stage kept DPI staged even when the count matched again; manual Apply restored immediate switching.
- No console errors. Ignored entry `.local/immediate-ui.html`; the fake client rejects raw hardware reports.

Automated tests additionally cover pending binding/lighting/DPI isolation, invalid-input pre-write rejection, profile/relevant-setting drift, error propagation, and imported/persisted/legacy-cache DPI-layout markers.

## Browser checks

- Chrome opened the local page and displayed a system HID picker containing `Xlite v4` after Connect.
- Separate-page checks covered performance, bindings, profiles and macros. Recording `A` produced down/delay/up; reload retained DPI drafts and macros. Test macros were cleaned up.
- No runtime console errors.
- Full post-authorization Chrome reads/writes were not completed during these UI actions: the user switched the active Chrome context and the embedded preview then lacked a completable chooser. Real protocol and the same TypeScript client's USB operations passed as above. First use still needs manual selection in standalone Chrome/Edge.

## 2026-10-15 checkpoint: then unverified

At this checkpoint, 8K writes, high rates and indicator write/readback, OS execution of all shortcuts, actual macro playback, movement, live notifications, resets and firmware upgrades were unverified. Subsequent 8K pairing, reads, DPI and lighting are recorded at the top and under 2026-10-18. 1K protocol reads/writes passed through the native adapter; later browser end-to-end connection evidence follows. Reset has confirmations; user settings were not erased merely for tests. Browser system boundaries and remaining features are in the README.

## 2026-10-16: Chrome connection-failure diagnostics

The user reported `Failed to write the feature report` on Pages in standalone Chrome/Edge. This round sent only queries, never setting writes:

- Native interface 3 also failed on its first query with `IOHIDDeviceSetReport failed (0xE0005000)` USB STALL; `.local/hardware-client-2026-10-15T20-19-53-173Z.json`.
- Closing only the page without reinserting allowed queries, but replies were valid-checksum status `05`; the old client wrongly waited until timeout. Native code marks offline; terminal handling and clear guidance were added.
- Wireless cursor motion was confirmed and STALL still occurred after waking, so sleep does not explain every failure.
- After reinsertion, interfaces 3/2 had identical descriptors, with passive payloads of 64 zero bytes / one zero byte. Sequential 3→2→3 queries succeeded/STALLED/succeeded; `.local/receiver-routing-20261015T202350Z.json`. This supports filtering short reports before sending, not a claim that interface 2 necessarily damages interface 3.
- A subsequent native connection also passed polling and failed identity SET; `.local/hardware-client-2026-10-15T20-27-27-044Z.json`. Filtering/guidance alone therefore did not prove all browser issues resolved.

The update adds 1K passive report-length checks, bounded timeout, fresh polling/identity and per-candidate diagnostics. Cached packets never establish connection success. No speculative initialization writes, fixed delays or setting resends were added at this checkpoint.

Eleven new tests cover status `05`, checksum/stale frames, no SET on short candidates, fresh valid handshakes, continuing after probe timeout, and primary-error priority. The fake browser skipped one-byte channels, retained `NetworkError` at the actual 64-byte candidate stage and had no console errors. No real mouse was operated in this UI check.

### Further identity-query diagnosis

User Chrome 155 diagnostics showed the short candidate was skipped, the 64-byte candidate read 1000 Hz polling, then immediately failed sending `01/84/04` in the same millisecond. That query exactly matched two earlier successes, with no new payload/checksum/address differences. The `NotAllowedError` name does not supersede the confirmed underlying USB STALL.

Read-only `.local/receiver-session-20261015T204042Z.json` found no stable recovery from 30/100 ms between commands or reopening the handle. After another user reinsertion, native-style 30 ms between SET and first GET passed model/firmware/battery/charging/polling; 100 ms passed too, and warmed-up 0 ms later passed. Evidence `.local/receiver-session-20261015T204255Z.json`. This supports matching native timing, not proving one fixed threshold as every failure's sole cause.

The production 1K client now waits 30 ms before first GET (firmware 100 ms), retains pending polling, and permits initial plus at most three identity recovery queries only after send failure with a valid connection. Error replies, wrong model, receive failures, timeout and disconnect never retry; ordinary writes never retry. Eleven new tests cover wait placement, ceilings, classification and disconnect cancellation.

The updated production client completed a full real 1K read-only snapshot: `.local/hardware-client-2026-10-15T20-47-02-651Z.json`, `ok: true`, `identityTries: 1`, `warnings: []`, firmware `00.00.10.16`, profile 1, 1000 Hz and zero setting writes. It did not exercise identity recovery; that branch has automated coverage.

On 2026-10-16 (Asia/Shanghai), Pages commit `a7131bf` deployed successfully; online JavaScript SHA-256 matched the local production build. Following the standalone Chrome/Edge verification steps, the user confirmed connection and displayed settings with 1K Dongle. This accepts the repaired browser connection, not every root cause or a repeat of every write in all states.

## 2026-10-18: initial 8K implementation before hardware

No 8K receiver was initially available and no real-device command was sent. V0.11/V0.12 were only statically unpacked/decompiled; source, hashes and protocol are in [pairing evidence](receiver-pairing-evidence.md). This preserves initial results; later hardware progress follows.

- 44 pairing simulations: native Output bytes, selection/ambiguity, send once, pending/already/success/failure, unknown input, timeout, abort, late open, removal during hung send, propagation and listener cleanup.
- 28 8K settings tests: 2K/4K/8K encoding through the real transfer path with fake readback, wrong model/offline rejection, both indicators, unsupported, checksum/timeout and native 30/100 ms waits.
- All 178 `npm test` tests and TypeScript/Vite build passed. Fake HID does not establish radio pairing or actual polling frequency.
- Browser checks covered entry, step layout, inert background, title focus, Escape and focus return; `.local/8k-pairing-ui.png`. No real permission request or pairing.

The planned hardware sequence was:

1. Read-only USB/HID descriptors, interfaces and permission results for `3710:5403`; establish MI02 pairing versus MI03 settings. Initial identical candidates were refused pending routing evidence.
2. Establish input ID/length/status and actual success/already/timeout/cancel/removal states. Cancellation stops local waiting, not the radio command.
3. Validate `3710:3401`, wireless cursor, full reads, reconnect and draft retention after pairing.
4. Back up; write/read/use 1000→2000→4000→8000 Hz individually, then restore. Register values are not measured USB frequency.
5. Check both indicator modes, battery, profiles, DPI, macro reads/writes/restoration and 1K/wired regressions.

None of those five had completed hardware acceptance at initial completion. Original tools, decompilation and screenshots are excluded from release builds.

## 2026-10-18: real 8K routing and post-pairing connection

After attaching original `8K Dongle` (`3710:5403`), the app reported ambiguous pairing interfaces. Passive `.local/8k-passive-20261018T045508Z.json` confirmed identical MI02/MI03 descriptors, each report ID 0 and 64-byte input/output/Feature. Two `GET_FEATURE(0)` calls each produced native `0xE0005000` failures on MI02 and valid 64-byte status `05`, checksum `0005` on MI03. No pairing output or setting write was sent.

The implementation adds two-interface read-only routing: two consecutive observations per side must yield stable failure versus valid settings. Unknown/unstable results, single shared-descriptor candidates, multiple receivers, permission errors and timeout stop. Error names/browser limitations are in [pairing evidence](receiver-pairing-evidence.md#real-device-passive-routing-check).

`.local/8k-route-check.ts` imports production `resolvePairingInterface` via a native adapter allowing only open/receive/close. It selected MI02 even with MI03 first; `.local/8k-route-check-result.json`: `ok: true`, `selectedInterface: 2`. Its explicit error translation does not replace WebHID permission/error/full-pairing acceptance. The agent sent no hardware pairing command.

At this routing checkpoint all 205 tests and TypeScript/Vite build passed. Regressions cover real descriptors/passive replies, reversed candidates, 65-byte prefixes/DataView offsets, classification, invalid replies, missing siblings, cancellation and late-open cleanup.

The user then reported pairing complete but ordinary identity `01/84` timed out. Read-only `.local/8k-read-sequence-20261018T050158Z.json` found correct identity with the preceding category/register: `01/89` after polling, `02/86` after active profile, `08/81` after battery. Strict matching discarded valid identity. Indicator `08/89` likewise retained previous threshold `08/88`.

Compatibility is limited to these known read sequences: fresh successful polling before identity `01/89/04`, retaining checksum and `3710:3401`; validated 5–100% threshold before indicator `08/88/02`, requiring mode 1/2. Public `transact`/`matchesReply` and writes remain strict. Independent indicator reads also query threshold first. Normal 8K now passively checks reports like 1K, skipping MI02 before any settings query.

The repaired production client completed a real full read: `.local/hardware-client-2026-10-18T05-04-48-869Z.json`, `warnings: []`, `identityTries: 1`, `identityReplyVariant: previous-polling-header`. Firmware `00.00.10.16`, profile 1, 1000 Hz, battery 70%, not charging, sleep 30 seconds, threshold 10%, indicator 2, empty macros. All 34 sent packets were queries, zero writes.

New regressions cover retained identity addresses, wrong-model/corrupt/stale polling refusal and indicator versus old threshold. This checkpoint validates the repaired hardware read path; browser reconnect, complete pairing, high rates and indicator writes were still pending then.

Final checks at that point: all 242 tests, TypeScript/Vite and `git diff --check` passed. A later native reread `.local/hardware-client-2026-10-18T05-06-15-060Z.json` received only stale `06/81` status `05` during polling and correctly timed out. The cause was unknown, stale data was not accepted, matching was not further relaxed, and parallel native probing stopped pending browser-only reconnection.

### Same day: first browser reconnection accepted

Hot reload retained old client behavior: new diagnostic text, but candidate 1 still failed polling send and candidate 2 rejected `01/89/04` identity. A full reload successfully auto-connected and displayed connected/synchronized. Read stages were 800/1000/1600/2000/6400/12800, active 4; 1000 Hz, debounce 0 ms, LOD 1.0 mm, brightness 30%. 2K/4K/8K options appeared but were not clicked/written. Screenshot `.local/8k-connected-browser.png`. This accepts browser connection/reads at that checkpoint; higher rates, lighting writes and broader states were then untested.

### Same day: persistent pending read after DPI actions

The user reported `05/84` timeout after switching/editing DPI, with the UI showing 8000 Hz. Browser logs directly showed about 1.2 seconds of matching `04/81`, profile 1, button 4, status `02`. This establishes persistent pending for that observed button read, not the entire original `05/84` sequence or sleep as the cause.

Independent read-only native-adapted `.local/hardware-client-2026-10-18T05-11-30-463Z.json` completed a full snapshot at configured 8000 Hz: no warnings, profile 1, active stage 5, six stages/bindings, 34 queries and no writes. A captured `01/89` pending changed only request status `00`→`02`, retaining bytes 1–63 and request checksum `008c` instead of the status-inclusive `008e`. It completed normally without recovery. This proves configured 8000 Hz, not actual frequency or recovery after DPI writes.

Native `GetButton`, `GetActiveDPI`, `GetDPIStageInfo` call `QD7R5XpBRr`: initial 30 ms wait, up to 30 additional pending polls at 10 ms, then 50 ms before/after resending, up to five rounds. Callers have no extra fixed post-DPI-write wait. Web recovery applies only to internal 8K `05/84`, `05/81`, `04/81`: 30 consecutive matching pending, at most five retries, default total three seconds with explicit timeout precedence. Besides valid checksum, status `02` retaining exact original bytes 1–63 is pending only, never success. All writes/public `transact` remain no-resend.

`tests/receiver-pending-read.test.ts` uses captured successful replies and simulates a stall that clears only after resending the read. Tests cover scope, checksum, ceilings/deadlines, failure/disconnect and unaffected cable/1K/writes. Resend/recovery causality belongs to the simulation; the intermittent hardware DPI fault's cause remains unknown.

A separate stale-completion recovery caches only checksum-valid complete responses for the same device/epoch. Thirty exact 64-byte rejected repeats permit one read resend with 50 ms before/after, within the original deadline. Old content never succeeds; writes/public `transact` never resend. Unknown stale frames, prior connections and old status `05` cannot trigger it. Causality is still tested with simulated traces.

To avoid a native save dialog blocking diagnostics, the page now exposes expandable full JSON. Reading it saved `.local/8k-dpi-before-browser.json`: 68 entries, 34 queries/34 completions, zero writes. The browser skipped the failed candidate and completed identity/settings. Polling was 8000, both stage registers 5; the retained local draft showed 3, so it remained intact without clicking/changing DPI. This validates normal reads and draft retention, not actual exercise/removal of the intermittent fault through either recovery branch.

Earlier `.local/8k-browser-timeout-20261018.json` records an initial polling `01/89` timeout caused by stale `04/83` status `05`, not a current completion. The observed device was idle with 30-second sleep configured, but that does not prove sleep causality or explain the initial DPI pending report. Such old data is still rejected.

Final checks: all 297 tests, build and `git diff --check` passed. `.local/8k-pending-read-recovered.png` shows 8000 Hz with retained stage-3 draft; actual stage 5 is established by packet data. No hardware DPI write was performed in this round, and the screenshot is not proof of hardware pending recovery. The user subsequently confirmed it worked and moved to indicator controls; this records user-side restoration, not all wireless-state acceptance.

### Same day: indicator applied but falsely reported timeout

After changing indicator mode, the user saw the light change but `08/09` timeout/possible partial-write guidance. In `.local/8k-indicator-write-browser.json`, zero-based log 91 sends one `08/09/02`, profile 1, mode 2. The following 51 replies exactly equal log 90's verified `02/86` active-profile completion, without a matching write ACK. Previous indicator read was 1, later independent read 2. This proves strict write-address waiting could falsely time out despite applied lighting.

Native `SetDongleIndicator` waits 100 ms then calls `muoRu6xnuS`, which accepts status 1 without checking address. Web handling stays stronger: fresh threshold/indicator pre-read, one setter, then private `indicator-write` may enter mandatory verification after exact same-device/epoch prior verified completion. It is neither an ACK nor a cache update. Writes never enter pending/stale read retry; public `transact` stays strict.

`writePower` must read full power, compare target mode and other requested fields, check explicitly addressed profile before/after, and guard device/epoch throughout. Wrong/unavailable readback, removal or connection replacement cannot succeed or resend the setter.

Twenty-five targeted tests initially passed: both modes, ACK/retained completion, real write bytes, send once, mismatches/unsupported/offline, profile drift, tampered/old frames, checksum/I/O/removal/pre-read failure and unaffected ordinary/non-8K transactions. New pre-/post-read responses are simulated from known protocol; the old fault's predecessor was `02/86`, whereas the new sequence makes it an indicator reply. The original fault trace alone is not a repaired hardware pass. Later hardware outcomes follow; full checks were recorded later.

The browser then executed the new sequence. `.local/8k-indicator-write-first-verify.json` sent mode 1 once, received the retained indicator, and entered verification, but completed battery `255` stopped the old 0–100 check before indicator readback.

`.local/8k-indicator-write-reverify.json` sent mode 2 once through the same branch; fresh battery 68%, sleep 30 seconds, threshold 10%, indicator 2 and profile 1 before/after completed that write/readback acceptance. A subsequent mode-1 retry again stopped at battery `255`, so it did not establish both modes or make the earlier mode-2 success the final hardware state.

Native `GetBattery` (`QeugLfjKJdKnv2KrF5.cs:1503–1569`) explicitly converts completed `255` to `0` and returns success, without calling it sleep/offline. It uses the normal 30 ms wait and no extra retry for 255. Native indicator UI calls the getter immediately after setter, without an extra fixed settle. This establishes special handling, not actual 0% or sleep. The final Web fix uses `batteryPercent: undefined`, retains other power fields and displays no fabricated 0%. Other out-of-range values remain rejected (101/254 tested); unknown battery never bypasses indicator/profile checks.

In final `.local/8k-indicator-write-final-verify.json`, mode 2 completed a full page save. Mode 1, with battery 255 represented as unknown, completed `writePower` with fresh indicator 1/profile 1, but `writeSettings`' final full snapshot timed out on LOD `07/82`. Mode 1 is written/readback-verified, without complete end-to-end save acceptance.

The user then questioned ongoing DPI edits, so all hardware work stopped and mode 2 was not restored. Last verified light mode is 1 (connection), original 2 (low-battery only) remains unrestored. `.local/8k-dpi-audit-stopped.png` only shows last-read stage 4, 2000 DPI and 8000 Hz with a refresh-required state, not a new query or complete save.

An audit deduplicated the four browser diagnostics by time/direction/full packet. Beijing 13:38–13:42 (UTC 05:38–05:42) contains five settings sends, all `08/09`, modes 1,2,1,2,1; no DPI/polling writes. Valid bulk/dedicated stage reads were 4, X/Y 2000 DPI, polling 8000. Earlier Beijing 13:32:02.875 contains one `05/04` DPI block write changing active stage 3→4. Protocol logs cannot identify the operator, so no attribution is inferred.

Final checks: 34 targeted indicator tests, all 331 tests and TypeScript/Vite build passed. One cached-read test had previously exhausted its simulated 300 ms under parallel scheduling. After reproducing controlled event-loop pressure, only four scenarios requiring successful resend gained 1000 ms test budgets; production deadlines and explicit 60 ms tests stayed unchanged. The stress scenario and all 22 tests in that file then passed; `.local/indicator-write-tests-after-budget.txt`. These checks do not replace the stated hardware boundaries.
