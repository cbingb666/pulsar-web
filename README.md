# Pulsar Fusion Web

针对 **Pulsar Xlite v4 Mini** 的 Web 配置工具，支持本地运行和 GitHub Pages，使用 Chrome / Edge 的 WebHID 直接访问鼠标。基于用户提供的 Fusion 1.0.5.4 安装包静态解包、.NET 反编译及已连接鼠标的 HID 报文验证。没有执行 Windows 安装程序。

## 启动

```sh
npm install
npm run dev
```

在桌面版 Chrome / Edge 打开终端打印的本地地址（默认 `http://localhost:5173`），点击 **连接鼠标**，在浏览器选择器中选择 Xlite v4。Safari / Firefox 不提供此处需要的 WebHID。内嵌预览仅用于查看页面；设备授权请使用独立 Chrome / Edge。

```sh
npm test       # 协议、传输、宏与文件格式校验
npm run build # TypeScript 检查和静态构建
npm run preview
```

生产文件位于 `dist/`，可通过 HTTPS 静态托管。无需账号、服务端或本地驱动桥接程序。配置和本地宏存储于当前浏览器；浏览器授权与存储按站点隔离。

## GitHub Pages 自动部署

[部署工作流](.github/workflows/pages.yml) 在推送到 `main` 或手动运行时执行：`npm ci` → 测试 → TypeScript/Vite 构建 → 发布 `dist/`。工作流不运行硬件测试，也不上传安装包、设备备份或反编译目录。

在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。当前项目的默认站点地址为 `https://cbingb666.github.io/pulsar-web/`；工作流使用 Pages 返回的路径构建，图片和 JS/CSS 会遵循同一子路径。本地开发仍使用 `/`。

可在本机检查相同的生产路径：

```sh
npm run build -- --base /pulsar-web/
npm run preview -- --base /pulsar-web/
```

Pages 的 HTTPS 地址可满足 WebHID 的安全上下文要求。首次在部署站点使用时需重新授权鼠标；localhost 中保存的草稿不会自动迁移，可用 JSON 导入导出。

私有仓库能否启用 Pages 取决于 GitHub 套餐，参见 [GitHub 官方要求](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。工作流不会改变仓库可见性。

## 已实现

- 读取真实设备配置；编辑暂存；应用后重新回读验证，失败明确提示。
- 6 个设备配置槽位的读取、切换；本地草稿、JSON 配置备份、导入校验。
- 1–6 档 DPI、独立 X/Y、50–32000 DPI、10 DPI 步长、当前档位、各档指示灯颜色。
- 回报率、0–15 ms 消抖、0.7/1/2 mm LOD、Motion Sync、角度捕捉、波纹控制。
- 6 个按键：鼠标、滚轮、键盘组合、DPI、配置循环、多媒体、快捷功能及设备宏；保留至少一个左键。
- DPI 指示灯关闭/常亮/呼吸、亮度和呼吸速度。
- 电量、充电状态、固件版本；30 秒至 15 分钟休眠、低电量阈值。
- 宏录制、键盘/修饰键/鼠标/滚轮/延迟事件、编辑排序、JSON 和原版 Fusion CSV 导入导出。
- 设备宏上传、回读、导入、删除；按键绑定支持一次、指定次数、按住循环、再次按下停止。删除前检查全部槽位中的引用。
- 通信日志和诊断导出；断连、校验和、超时、错位响应、部分写入失败处理。
- 配置恢复和出厂恢复入口有独立确认；出厂恢复发送后断开，并要求重新连接检查状态。

设备标识：有线 `3710:3401`、1K 接收器 `3710:5402`、8K 接收器 `3710:5403`。只有 8K 接收器允许选择 2K/4K/8K 和接收器指示灯模式。后两种连接方式尚未在本次实机上验证。

## 验证与边界

实测设备为这台 Mac 上通过 USB 连接的 Xlite v4，固件 `00.00.10.16`。读写证据和范围见 [验收记录](docs/verification.md)。**这是可用的逆向实现，不宣称已经与 Windows 原版 100% 等价。**

尚未覆盖：

- 浏览器无法修改 Windows 指针速度、系统双击/滚轮速度、系统托盘和开机启动，也不能在页面失焦后全局录制键鼠。
- 宏中的鼠标移动轨迹：原生序列化与解析代码的操作码存在矛盾，当前明确拒绝此类事件。长延迟使用多个已确认的 16 位延迟保持总时长。
- 独立 HID 通知接口的实时无线信号与物理 DPI 按键通知尚未接入；点击重新读取刷新状态。
- 8K 接收器、无线链路、全部按键动作的实际执行、宏在不同应用中的执行效果、固件刷写和破坏性重置尚未做实机验收。
- 当前界面为中文 Web 布局，沿用原版资源及功能结构；不是逐像素 WinForms 复制，也未复刻所有语言。

原版 CSV 不保存循环方式；循环方式属于设备按键绑定。CSV 逗号键有原程序自身不转义的问题：可以识别原版导入，但导出该键时会提示改用 JSON。JSON 配置为此 Web 版的附加格式，原版此版本的文件对话框仅发现宏 CSV。

## 项目结构

- `src/protocol.ts`：数据模型、校验、报文构造及按键动作。
- `src/hid.ts`：串行 WebHID 传输、设备配置、宏存储、回读验证。
- `src/macros.ts`、`src/macro-codec.ts`、`src/native-files.ts`：宏编辑模型、原生字节流、CSV。
- `src/App.tsx`、`src/MacroEditor.tsx`：设备页面与宏编辑器。
- `docs/extraction.md`、`docs/native-evidence.md`、`docs/protocol.md`：提取链、源程序证据与协议说明。
- `scripts/`：仅用于开发验证的 macOS/hidapi 诊断工具，Web 应用不依赖它们。
- `.local/`：忽略提交的原始安装包提取内容、反编译结果、工具和设备备份。

可选硬件验证命令默认只读；带 `--write-test` 才执行备份后的临时修改与恢复。不要与其他配置工具同时运行。终止进程、拔线或断电可能中断恢复，原始报文备份在 `.local/`。

```sh
python3 scripts/read-device.py
python3 scripts/hardware-smoke.py --write-test
node_modules/.bin/tsx scripts/hardware-client-smoke.ts --write-test
```

原版程序及反编译源码不包含在构建产物中。`public/assets/` 的鼠标和品牌图片来自用户提供的软件，用于界面复现；权利仍属于原权利人，本项目不授予这些资源的再分发权利。开源参考实现的 MIT 声明保留在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
