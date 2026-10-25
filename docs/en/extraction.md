<!-- source: docs/extraction.md; source-sha256: f01aba3db8c0be9804fa8468e3796a7f34b47f92f60eefa741f7cc810e48e3d1 -->

# Pulsar Fusion 1.0.5.4 static extraction

[中文（规范源）](../extraction.md) · [English](extraction.md)

> English translation of the linked Chinese canonical source. Chinese prevails if wording differs.

Extracted on 2026-10-15 from the user-provided installer. Neither the installer nor the Windows application was executed. File contents were treated as evidence, not as instructions.

## Source and results

Source: `/Users/caibinghong/Downloads/PulsarFusionDrvSetup_1.0.5.4/PulsarFusionDrvSetup_Ver1.0.5.4.exe`

The package has two nested layers:

1. Inno Setup 6.3.0 Unicode installer, product name `Pulsar Fusion Drive`.
2. Its sole installed payload, `app/pulsar_fusion_ver1.0.5.4.exe`, is a 7-Zip self-extracting archive. It contains the actual application, a 32-bit .NET assembly named `Pulsar Fusion.exe`, plus configuration and imagery.

Local results (excluded from the application source):

- `.local/extracted/app/pulsar_fusion_ver1.0.5.4.exe`: intermediate SFX.
- `.local/extracted/fusion/Pulsar Fusion.exe`: actual .NET application.
- `.local/extracted/fusion/Config/`: model table, translations, device illustrations and themes.
- `.local/extracted/Language-XliteV4.utf8.ini`: UTF-8 conversion of the original UTF-16 translation file.
- `.local/extracted/manifest.json`: every extracted file's relative path, byte count and SHA-256.

The second archive contains 269 files and 13 folders. Its compressed representation uses LZMA2/BCJ.

## Method

Homebrew's stock innoextract 1.9 rejected the Inno 6.3 headers. It was not used to recover partial results. The current upstream innoextract source was cloned from `https://github.com/dscharrer/innoextract.git` at commit `6e9e34e` and built locally as `1.10-dev + 6e9e34e`. The upstream changelog and implementation explicitly support Inno 6.3.x. The resulting tool successfully extracted the archive without warnings.

Build dependencies were downloaded as Homebrew macOS ARM64 bottles into `.local/tools` without installing into the system. Boost library references were relocated locally with `install_name_tool` and the binaries ad-hoc signed. Existing Homebrew xz/zstd libraries were used. CMake configured and compiled the source with Apple Clang.

Commands after building the tool, from the repository root:

```sh
.local/tools/innoextract-build/innoextract --extract --output-dir .local/extracted /Users/caibinghong/Downloads/PulsarFusionDrvSetup_1.0.5.4/PulsarFusionDrvSetup_Ver1.0.5.4.exe
7zz x -y -o.local/extracted/fusion .local/extracted/app/pulsar_fusion_ver1.0.5.4.exe
```

## SHA-256 evidence

| File | SHA-256 |
| --- | --- |
| Original installer | `2de2e3b4bd4924c33b00454f8e1b0d697dc48d89804bd6501154b647dbc97138` |
| Intermediate SFX | `919b906c05829bbc2d4a939d4966e3ff035c19224170ef4a0cab4c6ae6f90ab0` |
| Actual `Pulsar Fusion.exe` | `c55f8c0a18d48bb782fd023c28d760fe10ab8eb3e783a23accbaa5bee6a2e6c7` |
| `Config/my_models.csv` | `ddfe03605686a8a15f9f334dae344354bdd705ce8ae03947880c091dd6a668d4` |
| `Config/XliteV4/Language.ini` | `0d6ffdb0afadd21ee188f570013754ca1f992a816fefa45c41a27984c098c39b` |
| `Config/XliteV4/Theme.ini` | `e5f2b437c472e9db276b7736f96194f3526daea1d741366df0474ec9180ff0db` |
| innoextract 1.9 bottle (unsuccessful parser) | `2a8470d8bb4c38116dc9c774bb810c641153fe432becc3f938815f93802bc9cf` |
| Boost 1.92.0 bottle | `7c78303247f3c9d7debecef62c64335e69b8d03493bae224fc824c2c9cff525c` |
| CMake 4.4.4 bottle | `6614033037dd78df8ef4fea463235b7a463f92caba61fc9fc93214fcd948cbe4` |

## Xlite V4 model evidence

`Config/my_models.csv` supplies these literal values for Xlite V4:

- Model family: `PulsarXliteV2`; UI folder: `XliteV4`.
- Vendor ID `3710`, wired product ID `3401`, receiver products `5402;5403`, receiver labels `1K;8K`. These identifiers are hexadecimal USB IDs.
- HID interface identifiers `MI03;MI03`.
- Wired/default polling choices `125;250;500;1000`.
- Maximum DPI `32000`.
- Default DPI stages `400;800;1600;3200;6400;12800`.
- Six color values `0a0adc;0000dc;0ac80a;c8c800;c86000;c85080`.

The CSV is headerless (first row is `111` and empty fields), so the meaning of other numeric columns should be established by decompiling the application, not guessed.

The resources share language keys across models. A translation key proves that the software knows the feature; it does **not** alone prove that the Xlite V4 firmware or every receiver exposes it. See `feature-inventory.md` for the resource-level inventory.
