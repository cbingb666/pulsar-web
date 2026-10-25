<!-- source: docs/native-files.md; source-sha256: fa137c822a0f3dc3141a8ee7e8ac4877d0cf2c39088de1b3b4efecd8161d0b4a -->

# Native file compatibility

[中文（规范源）](../native-files.md) · [English](native-files.md)

> English translation of the linked Chinese canonical source. Chinese prevails if wording differs.

The extracted 1.0.5.4 `MainForm` exposes two file dialogs, both for macro CSV: `fIxcgXPaRc` imports, `jaJcMTrhgE` exports, `ExportListViewToCSV` serializes, and `DbgcQTtOC6` parses (decompiled lines 9220–9370). No native profile-file import/export dialog was found in this version; the Web app adds its own JSON profile backup.

Native macro rows are unquoted `ImageIndex,Text[,KeyCode]` with a header starting `ImageIndex,`. Index 0 is seconds, 1/2 are keyboard down/up, 3 is a mouse/wheel/movement event. The key text is authoritative: the optional numeric column sometimes contains a Windows key and sometimes a USB usage. Key names follow `KDLoSFJ1tZc2p1kSIM.aceaRr3Y4h`.

The Web app imports/exports verified key, modifier, mouse button, wheel, and delay rows. Movement is rejected because native encoder/decoder opcodes disagree. Original comma-key rows are recognized on import; export containing a comma key is refused with a JSON alternative because the native CSV parser does not implement quoting. Neither the original CSV nor its importer stores loop mode; looping belongs to the mouse button assignment.

Validation: `tests/native-files.test.ts` checks original row semantics, round-trip supported events, and rejects unsupported/malformed content atomically. Native Windows app execution has not been performed on this macOS host.
