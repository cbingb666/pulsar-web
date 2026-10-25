<!-- source: docs/official-research.md; source-sha256: 32beef3de911960f5e726464e0fb6ee448df218c07a3ee7119f08d77917a35bf -->

# Pulsar Fusion / Xlite v4 Mini official-source research

[中文（规范源）](../official-research.md) · [English](official-research.md)

> English translation of the linked Chinese canonical source. Chinese prevails if wording differs.

Checked 2026-10-15. This inventory distinguishes model-specific documentation, generic Fusion guidance, and browser requirements. It does not establish packet formats or claim hardware verification.

## Model and software

The official download page explicitly assigns Fusion **V1.0.5.4 (2025-06-26, connection optimization)** to Xlite v4 Mini. Earlier release notes mention DPI-stage and macro fixes. Firmware is a separate download. [Pulsar downloads](https://www.pulsar.gg/pages/download)

Xlite v4 Mini uses XS-1, supports up to 32,000 DPI, programmable buttons/macros and Motion Sync. The included receiver supports 1K; 8K requires the optional 8K receiver. The desktop configuration software requires Windows. [Model product page](https://www.pulsar.gg/products/xlite-v4-mini-gaming-mouse)

## Model-specific values

The official quick guide, inspected visually on pages 1–3, supplies these values:

| Setting | Documented behavior |
| --- | --- |
| DPI | 50–32,000; increments of 10; default active DPI 800 |
| DPI stages, page 2 | 400, 800, 1600, 3200, 6400, 12800 |
| Stage indicator colors | Light blue, blue, light green, yellow, orange, pink |
| Polling | 125, 250, 500, 1000 Hz; 2000/4000/8000 Hz with 8K receiver |
| LOD | 0.7, 1, 2 mm |
| Inputs | Left/right, wheel, forward/back, underside DPI button |
| Pairing gesture | Hold left, right and wheel buttons together for 3–4 seconds |

The guide contains an inconsistency: page 2 lists six DPI stages, but page 3's compact specification lists only 400/800/1600/3200. Actual configuration readback must decide defaults and enabled stages; never overwrite them from documentation alone. [Official quick guide PDF](https://www.pulsar.gg/cdn/shop/files/Manual_Xlite_v4_Quick_Guide.pdf?v=13613901784141965113)

## Functional inventory and UI evidence

Pulsar's generic Fusion FAQ documents device selection; language/startup/minimized preferences; firmware and battery status; button assignments; debounce; auto sleep; profiles; import/export/restore; Motion Sync; DPI stages; polling; sensitivity; LOD; double-click speed; angle snapping; ripple control; DPI LED color/brightness/effect; and macro recording/editing/assignment. Its screenshots show older **Fusion Wireless Mice V1.2.7**, so exact version-specific controls must come from the supplied executable. The FAQ's three-stage claim also conflicts with the Xlite v4 guide. [Official Fusion FAQ](https://eu.pulsar.gg/pages/faq)

The product-page software illustration uses a light interface, blue accents, a left sidebar labeled **HOME / CUSTOMIZE / PERFORMANCE / MACRO**, and a right sidebar for language/device/profile plus application settings. [Official software illustration](https://www.pulsar.gg/cdn/shop/files/Pulsar_mouse_software_N1.png?v=1721033524)

Additional official screenshot references (older dark UI, useful for feature grouping only):

- [Device selection](https://eu.pulsar.gg/cdn/shop/files/UwrNK_Sz2oDLxHAtnofOhLGFvg7tMpsAzw.png?v=1725342755)
- [Application preferences, visibly V1.2.7](https://eu.pulsar.gg/cdn/shop/files/Or6qHa6UvXCzDQCvfXXhZ4_RZ6z3ZcuZYg.png?v=1725342796)
- [Button assignment / performance](https://eu.pulsar.gg/cdn/shop/files/awUFYBPFHyja7-IpG2nPftmrUel2rqYznw.png?v=1725342813)
- [Macro UI](https://eu.pulsar.gg/cdn/shop/files/0K8nnWKSEMn5SDdLUziXKZsPFlPdaO19fQ.png?v=1725342829)

## Browser constraints

WebHID supports input, output and feature reports, permission-filtered by USB vendor/product and HID usage. Inspect every returned HID interface and its `collections`, then open the vendor-specific configuration interface. Chrome protects generic mouse/keyboard collections; access to a mouse does not imply access to its ordinary movement or button reports. Feature reports can carry configuration in both directions, but their format is device-specific. `sendFeatureReport(reportId, payload)` separates the report ID from payload bytes; distinguish this from native HID libraries that prepend the ID. Reconnect/disconnect events and previously authorized devices are supported. [Chrome WebHID guide](https://developer.chrome.com/docs/capabilities/hid)

The API requires a secure context and device requests require transient user activation. Consequently connection needs a user-triggered chooser on HTTPS or a trustworthy local development origin; it cannot silently acquire a new device. WebHID is available in desktop Chromium-based browsers including Chrome/Edge, while individual browsers may disable it. [Specification](https://hid.spec.whatwg.org/), [implementation status](https://github.com/whatwg/hid)

For reads, `receiveFeatureReport()` returns the operating system's report data. The first byte **may** contain a report ID; the standard does not guarantee that it always does. Validate length and framing against the known report layout instead of blindly removing byte zero. [Specification source](https://github.com/whatwg/hid/blob/main/index.html)

Implementation inference: Windows startup/minimized behavior and OS-wide sensitivity/double-click/scroll settings cannot be equated with device configuration. The web implementation must label these limitations instead of pretending a local slider changed the operating system. Browser macro capture is limited to events delivered to the active page; device-stored macro playback is a separate protocol feature that must be verified.

## Official browser app and protocol evidence

Pulsar operates [BIBIMBAP](https://bbb.pulsar.gg/). Its public [configuration](https://bbb.pulsar.gg/cfg.json) currently reports version 1.2.3 and a USB allowlist. It includes vendor `0x3710` but **does not include product `0x3401`**, the device identifier observed by the parent task. Therefore its existence is not proof that this Xlite v4 is supported. The publicly delivered app JavaScript calls WebHID; no official Xlite v4 protocol specification was found in the manufacturer pages examined. [Public app bundle](https://bbb.pulsar.gg/js/app.3283b4c5.js)

A separate community source implementation surfaced at [pulsar-mouse-linux](https://github.com/packerlschupfer/pulsar-mouse-linux). It is useful implementation evidence owned by that project's authors, **not a manufacturer protocol guarantee**. Any relevant commands still need comparison with the supplied Fusion binary and actual device responses.

## Acceptance implications

- Use device readback for initial state, stage counts, available polling rates and firmware-dependent options.
- Count configuration writes as successful only after transport completion and, where supported, matching readback.
- Test wired and receiver transports separately; 8K capability must follow the attached receiver.
- Keep local profile/macro editing distinct from confirmed device storage.
- Do not claim full parity before testing every exposed control against Fusion and the actual hardware.
