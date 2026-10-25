<!-- source: docs/development.md; source-sha256: 2dbde9ee023ea2cd1136cb4032f780266f9dda69f4df5323ef1a959b15ce2738 -->

# Development guide

[中文](../development.md) · [English](development.md)

## Running and checks

```sh
npm ci
npm run dev
npm run docs:check
npm test
npm run build
npm run preview
```

`npm run docs:check` checks Chinese/English document coverage, source hashes, local links, and heading anchors. See the repository's root [AGENTS.md](../../AGENTS.md) for documentation collaboration rules.

The development server uses `/` by default. Check the GitHub Pages production path locally with:

```sh
npm run build -- --base /pulsar-web/
npm run preview -- --base /pulsar-web/
```

## GitHub Pages workflow

The [deployment workflow](../../.github/workflows/pages.yml) runs on pushes to `main` or manual dispatch: `npm ci` → documentation checks → tests → TypeScript/Vite build → publish `dist/`. It uses the path returned by Pages, so images and JS/CSS share the same subpath.

The workflow runs no hardware tests, uploads no installers, device backups, or decompiled directories, and does not change repository visibility. See [Getting started and usage](../../README.en.md#local-deployment) for enabling Pages.

## Project layout

- `src/protocol.ts`: data models, validation, packet construction, and button actions.
- `src/hid.ts`: serial WebHID transport, device settings, macro storage, and readback.
- `src/receiver-pairing.ts`, `src/ReceiverPairingDialog.tsx`: separate 1K / 8K pairing interfaces, states, and guidance.
- `src/firmware-package.ts`, `src/firmware.ts`, `src/firmware-transport.ts`, `src/FirmwareFlashDialog.tsx`: fixed official-image validation, separate flashing protocol, and staged authorization.
- `src/macros.ts`, `src/macro-codec.ts`, `src/native-files.ts`: macro editing model, native byte streams, and CSV.
- `src/App.tsx`, `src/MacroEditor.tsx`: device pages and macro editor.
- `src/i18n.ts`, `src/use-locale.ts`, `src/locales/`: language detection and persistence, React subscriptions, and Chinese/English UI text.
- `docs/extraction.md`, `docs/native-evidence.md`, `docs/protocol.md`: extraction chain, native source evidence, and protocol descriptions.
- `scripts/`: macOS/hidapi development diagnostics; the Web app does not depend on them.
- `.local/`: ignored installer extraction, decompilation, tools, and device backups.

## Hardware diagnostics

These optional commands default to read-only. Adding `--write-test` enables temporary changes with backup and restoration. Do not run them alongside other configuration tools. Termination, unplugging, or power loss may interrupt restoration. Raw report backups are saved in `.local/`. Confirm that a backup is available before write tests and maintain power and connection.

```sh
python3 scripts/read-device.py
python3 scripts/hardware-smoke.py --write-test
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --write-test
# 1K defaults to read-only; --write-test enables temporary writes and restoration
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --product-id=0x5402
```

See [configuration protocol](protocol.md), [receiver pairing evidence](receiver-pairing-evidence.md), [firmware details](firmware.md), and [verification](verification.md) for the protocol, transport errors, and outstanding hardware checks. Passing automated tests does not establish coverage of every real-device operation or fault recovery.

## Development troubleshooting

After changing connection code, fully reload the page if hot reload repeats old errors. This recreates the connection client. Before testing real hardware, close other configuration pages, scripts, or software, then unplug and reconnect the target device.

`Failed to write the feature report` is the browser's generic HID send error. It does not alone establish permissions, sleep, or exclusive access as the cause. Connection diagnostics retain candidate report lengths, failure stages, and original errors. The `identityTries` diagnostic field records 1K model-query attempts. See [configuration protocol](protocol.md) for timing, the four-query limit, and retry boundaries.
