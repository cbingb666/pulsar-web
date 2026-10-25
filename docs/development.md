<!-- canonical-language: zh-CN -->

# 开发指南

[中文](development.md) · [English](en/development.md)

## 运行与检查

```sh
npm ci
npm run dev
npm run docs:check
npm test
npm run build
npm run preview
```

`npm run docs:check` 检查中英文文档覆盖、源文件哈希、本地链接和标题锚点。文档协作约定见仓库根目录的 [AGENTS.md](../AGENTS.md)。

开发服务器默认使用 `/`。可在本机检查 GitHub Pages 的生产路径：

```sh
npm run build -- --base /pulsar-web/
npm run preview -- --base /pulsar-web/
```

## GitHub Pages 工作流

[部署工作流](../.github/workflows/pages.yml) 在推送到 `main` 或手动运行时执行：`npm ci` → 文档检查 → 测试 → TypeScript/Vite 构建 → 发布 `dist/`。工作流使用 Pages 返回的路径构建，图片与 JS/CSS 遵循同一子路径。

工作流不运行硬件测试，也不上传安装包、设备备份或反编译目录，不改变仓库可见性。启用 Pages 的操作见 [启动与使用](../README.md#本地部署)。

## 项目结构

- `src/protocol.ts`：数据模型、校验、报文构造及按键动作。
- `src/hid.ts`：串行 WebHID 传输、设备配置、宏存储、回读验证。
- `src/receiver-pairing.ts`、`src/ReceiverPairingDialog.tsx`：1K / 8K 独立配对通道、状态处理和操作引导。
- `src/firmware-package.ts`、`src/firmware.ts`、`src/firmware-transport.ts`、`src/FirmwareFlashDialog.tsx`：固定官方固件校验、独立刷写协议与分步授权界面。
- `src/macros.ts`、`src/macro-codec.ts`、`src/native-files.ts`：宏编辑模型、原生字节流、CSV。
- `src/App.tsx`、`src/MacroEditor.tsx`：设备页面与宏编辑器。
- `src/i18n.ts`、`src/use-locale.ts`、`src/locales/`：语言检测与记忆、React 订阅及中英界面文案。
- `docs/extraction.md`、`docs/native-evidence.md`、`docs/protocol.md`：提取链、源程序证据与协议说明。
- `scripts/`：用于开发验证的 macOS/hidapi 诊断工具，Web 应用不依赖它们。
- `.local/`：忽略提交的原始安装包提取内容、反编译结果、工具和设备备份。

## 硬件诊断

以下可选命令默认只读；加上 `--write-test` 才执行备份后的临时修改与恢复。不要与其他配置工具同时运行。终止进程、拔线或断电可能中断恢复，原始报文备份保存在 `.local/`。执行写入测试前应确认备份可用，并保持设备供电与连接。

```sh
python3 scripts/read-device.py
python3 scripts/hardware-smoke.py --write-test
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --write-test
# 1K 接收器：默认只读；加 --write-test 验证临时修改和恢复
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --product-id=0x5402
```

协议、传输错误和未完成的硬件验证范围分别见 [配置协议](protocol.md)、[接收器配对证据](receiver-pairing-evidence.md)、[固件说明](firmware.md) 和 [验收记录](verification.md)。自动测试通过不代表已完成真实设备的全部操作或故障恢复验证。

## 开发环境排障

修改连接代码后，若热更新仍重复旧错误，请刷新整页以重新创建连接客户端。测试真实设备时先关闭其他配置页面、脚本或软件，再重新插拔目标设备。

`Failed to write the feature report` 是浏览器发送 HID 报告失败的统一提示，不能仅凭它判断权限、休眠或占用。连接诊断保留候选通道的报告长度、失败阶段和原始错误。1K 型号查询的恢复次数在诊断字段 `identityTries` 中；协议时序、最多四次查询及重试边界见 [配置协议](protocol.md)。
