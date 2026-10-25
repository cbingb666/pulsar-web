<!-- canonical-language: zh-CN -->

# Pulsar Fusion 1.0.5.4 静态提取

[中文](extraction.md) · [English](en/extraction.md)

2026-10-15 从用户提供的安装包提取。未运行安装程序或 Windows 应用。

## 来源与结果

来源：`/Users/caibinghong/Downloads/PulsarFusionDrvSetup_1.0.5.4/PulsarFusionDrvSetup_Ver1.0.5.4.exe`。

安装包有两层嵌套：

1. Inno Setup 6.3.0 Unicode 安装包，产品名称为 `Pulsar Fusion Drive`。
2. 唯一安装载荷 `app/pulsar_fusion_ver1.0.5.4.exe` 是 7-Zip 自解压档案，包含真正的 32 位 .NET 应用 `Pulsar Fusion.exe`，以及配置和图片。

本地结果（不包含在应用源码中）：

- `.local/extracted/app/pulsar_fusion_ver1.0.5.4.exe`：中间 SFX。
- `.local/extracted/fusion/Pulsar Fusion.exe`：真正的 .NET 应用。
- `.local/extracted/fusion/Config/`：型号表、翻译、设备插图和主题。
- `.local/extracted/Language-XliteV4.utf8.ini`：原 UTF-16 翻译文件的 UTF-8 转换。
- `.local/extracted/manifest.json`：每个提取文件的相对路径、字节数和 SHA-256。

第二层档案有 269 个文件、13 个文件夹，使用 LZMA2/BCJ 压缩。

## 方法

Homebrew 提供的 innoextract 1.9 拒绝解析 Inno 6.3 头部，未用它恢复部分结果。从 `https://github.com/dscharrer/innoextract.git` 克隆当前上游源码，提交 `6e9e34e`，本地构建为 `1.10-dev + 6e9e34e`。上游变更日志和实现明确支持 Inno 6.3.x，构建后的工具成功提取且没有警告。

构建依赖以 Homebrew macOS ARM64 bottle 下载到 `.local/tools`，没有安装到系统。使用 `install_name_tool` 重定位本地 Boost 库引用，并对二进制进行 ad-hoc 签名。使用现有 Homebrew xz/zstd 库；CMake 以 Apple Clang 配置并编译源码。

工具构建完成后，在仓库根目录执行：

```sh
.local/tools/innoextract-build/innoextract --extract --output-dir .local/extracted /Users/caibinghong/Downloads/PulsarFusionDrvSetup_1.0.5.4/PulsarFusionDrvSetup_Ver1.0.5.4.exe
7zz x -y -o.local/extracted/fusion .local/extracted/app/pulsar_fusion_ver1.0.5.4.exe
```

## SHA-256 证据

| 文件 | SHA-256 |
| --- | --- |
| 原始安装包 | `2de2e3b4bd4924c33b00454f8e1b0d697dc48d89804bd6501154b647dbc97138` |
| 中间 SFX | `919b906c05829bbc2d4a939d4966e3ff035c19224170ef4a0cab4c6ae6f90ab0` |
| 真正的 `Pulsar Fusion.exe` | `c55f8c0a18d48bb782fd023c28d760fe10ab8eb3e783a23accbaa5bee6a2e6c7` |
| `Config/my_models.csv` | `ddfe03605686a8a15f9f334dae344354bdd705ce8ae03947880c091dd6a668d4` |
| `Config/XliteV4/Language.ini` | `0d6ffdb0afadd21ee188f570013754ca1f992a816fefa45c41a27984c098c39b` |
| `Config/XliteV4/Theme.ini` | `e5f2b437c472e9db276b7736f96194f3526daea1d741366df0474ec9180ff0db` |
| innoextract 1.9 bottle（解析失败） | `2a8470d8bb4c38116dc9c774bb810c641153fe432becc3f938815f93802bc9cf` |
| Boost 1.92.0 bottle | `7c78303247f3c9d7debecef62c64335e69b8d03493bae224fc824c2c9cff525c` |
| CMake 4.4.4 bottle | `6614033037dd78df8ef4fea463235b7a463f92caba61fc9fc93214fcd948cbe4` |

## Xlite V4 型号证据

`Config/my_models.csv` 为 Xlite V4 提供以下字面值：

- 型号系列 `PulsarXliteV2`；界面文件夹 `XliteV4`。
- 厂商 ID `3710`，有线产品 ID `3401`，接收器产品 `5402;5403`，标签 `1K;8K`。这些标识均为十六进制 USB ID。
- HID 接口标识 `MI03;MI03`。
- 有线/默认回报率选项 `125;250;500;1000`。
- 最大 DPI `32000`。
- 默认 DPI 档位 `400;800;1600;3200;6400;12800`。
- 六个颜色值 `0a0adc;0000dc;0ac80a;c8c800;c86000;c85080`。

CSV 没有表头（第一行是 `111` 和空字段），其他数字列的含义应通过反编译确认，不能猜测。

各型号共用语言键。某个翻译键只能证明软件知道该功能，**不能**单独证明 Xlite V4 固件或每种接收器都提供该功能。资源层面的清单见 [功能清单](feature-inventory.md)。
