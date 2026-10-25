<!-- canonical-language: zh-CN -->

# 原版应用证据

[中文（规范源）](native-evidence.md) · [English](en/native-evidence.md)

使用 ILSpy 静态反编译提取的 `Pulsar Fusion.exe`，未运行 Windows 应用。反编译参考文件留在 `.local/decompiled/`，不随 Web 应用发布。程序集哈希和提取链见 [提取记录](extraction.md)。

主要证据为 `DriverPro/MainForm.cs`、`DriverCore.Model/SupportModel.cs` 和协议类 `huAZ2tYGRX2LLl1Kis/QeugLfjKJdKnv2KrF5.cs`。类名经过混淆，许多方法名仍保留。反编译 WinForms 代码提示缺少外部控件引用，因此本文件只依据明确赋值和方法体，不尝试运行反编译项目。

## Xlite V4 能力与限制

CSV 列含义由 `SupportModel.GetListModels` 确定，不从位置推测。Xlite V4 声明没有右侧按键、并非仅有线，也没有排除 LED 支持的接收器产品 ID。默认休眠字段是 `15`，但所查代码仅将它复制到型号/界面状态：该字段本身不能确定设备当前超时或固件使用的单位。

| 设置 | 原版行为 | 证据 |
| --- | --- | --- |
| DPI | 50–32000，步长 10 | `MainForm.InitDPIGrade`，1862–1893 行；最大 DPI ≥30000 的型号使用步长 10 |
| DPI 档位 | 可选 1–6；改变档数后从型号 CSV 初始化值/颜色 | `InitDPIGrade`；`pDvSnesWM6`，6485–6523 行 |
| DPI 默认档位 | 400、800、1600、3200、6400、12800 | Xlite V4 CSV 行 |
| LOD | Xlite V4 为 0.7、1、2 mm；写入模式 2 及距离 ×10 | `InitDPIGrade`；`xdCSaJDiVq`，4836–4880 行 |
| 消抖 | 0–15 ms | `RefreshDebounceTime` 在运行时覆盖设计器通用上限；输入限制在范围内 |
| 休眠 | 30–900 秒；30 秒后为 1–15 分钟 | `RefreshSleepTime`，4659–4699 行；`gQlcJIdmEa` 直接写滑块秒数 |
| 低电量阈值 | 5–100% | `RefreshPower`，4630–4654 行 |
| 回报率 | 125/250/500/1000 Hz，仅标签 `8K` 接收器增加 2000/4000/8000 | `RefreshPollingRate`，4883–4970 行 |
| 配置 | 从设备查询可用 ID，选择活动硬件配置 | `InitProfile`，1840–1859 行；协议 `GetProfileIDList` |
| DPI 灯 | 关闭=0、常亮=1、呼吸=2；界面亮度 0–100 映射字节 0–255；速度字节=100−界面速度 | `RefreshDPIEffect`/`ResetUIDPIEffect`，6530–6660 行 |
| 宏 | 原版编辑器最多 1000 行事件 | 构造器 `IgZLda7sS0=1000`；`CheckMacroMax` |

原版没有写死配置数量，配置名称显示为 `PROFILE {id}`。共享翻译文件虽有 `EditProfileName`，MainForm 没有配置改名方法；实际侧栏是配置选择、配置恢复和出厂恢复。同理，无限休眠的翻译键不能证明此版本存在该控件：查到的休眠界面是 30–900 秒滑块。

## 补充读取及电源协议证据

以下字节偏移均指**去除报告 ID 的 64 字节 WebHID 载荷**。原版数组是 65 字节，所有源码索引减一。载荷字节 0 是状态、1 是组、2 是操作码、3 是长度；普通命令数据从字节 6 开始。

| 功能 | 组 / 操作码 / 长度 | 数据和响应 |
| --- | --- | --- |
| 鼠标固件版本 | `01 / 87 / 04` | 响应字节 9,8,7,6 分别补齐十六进制并以点连接；原版等待 100 ms |
| 接收器固件版本 | USB 描述符 | 原版使用 `HidDevice.ReleaseNumberBcd`，不是固件写命令 |
| 可用配置 ID | `02 / 82 / 10` | 响应字节 6 为数量，7 起为 ID |
| 活动配置读取 | `02 / 86 / 01` | 响应字节 6 |
| 休眠读/写 | `08 / 85 or 05 / 03` | `[profile, secondsLo, secondsHi]` |
| 低电量阈值读/写 | `08 / 88 or 08 / 02` | 写入 `[profile,percentage]`；原版读取发送零数据、读响应字节 7 |
| 接收器 LED 读/写 | `08 / 89 or 09 / 02` | `[profile,mode]`；1=连接状态、2=仅低电量；状态 4=不可用 |
| 消抖写入 | `04 / 03 / 03` | `[profile,value,0]`；原版只写一个消抖字节 |
| V4 LOD 写入 | `07 / 02 / 03` | `[profile,2,7 or 10 or 20]` |

接收器 LED 选项仅在 `8K` 接收器时显示，还检查型号的无 LED 产品列表。Xlite V4 的排除列表为空。有线和 `1K` 接收器在原版不显示此控件。

本次证据检查没有测试或实现任何固件升级命令。

## 输入通知与连接质量

`MainForm.UCHomeDeviceItem_NTFUpdateMainUI` 和 `BgTmp_DoWork` 解码原生输入 report ID `5`。WebHID 单独通过 `event.reportId` 提供 ID；下表从 `event.data[0]` 开始。

| 通知操作码 | 载荷 |
| --- | --- |
| `01` | 字节 1 为活动配置 |
| `05` | 字节 1 为活动档位；2–3 为小端当前 DPI |
| `07` | 字节 1 为充电（`1`=充电），2 为电量百分比 |
| `08` | 字节 1 为在线（`1`=在线） |
| `0d` | 字节 1 为连接强度 |

`NotifyRssi` 将 61–100 映射为优秀、41–60 良好、21–40 一般、1–20 较差；五格信号以 20/40/60/80 分段。这是输入通知，不是已经发现的周期性 Feature 查询。原版单独打开通知 HID collection；宣称实时 RSSI 前需验证浏览器能访问对应 collection。

## 宏事件和按键编码

`MainForm.GetFunctionID`（4259–4286 行）映射三个可见播放模式：

- 固定次数：功能 `04`，参数 `[macroIdLo,macroIdHi,repeatCount]`。
- 按住循环：功能 `05`，参数 `[macroIdLo,macroIdHi]`。
- 再次按下停止：功能 `06`，参数 `[macroIdLo,macroIdHi]`。

事件序列化器 `f8hSzE51ql`（7890–8097 行）输出：

| 事件 | 字节 |
| --- | --- |
| 键盘按下/松开 | `[03,usage]` / `[04,usage]` |
| 修饰键按下/松开 | `[05,mask]` / `[06,mask]` |
| 鼠标按下/松开 | `[01,mask]` / `[02,mask]` |
| 滚轮向上/向下 | `[0b,01]` / `[0b,ff]` |
| 延迟 0–255 ms | `[0c,milliseconds]` |
| 延迟 256–65535 ms | `[0d,millisecondsLo,millisecondsHi]` |

修饰键左 Ctrl/Shift/Alt/GUI 掩码为 1/2/4/8，右侧为 16/32/64/128。鼠标左/右/中/后退/前进为 1/2/4/8/16。键盘 usage 使用 USB HID 键盘表。

原版序列化/解析对长延迟和指针移动存在分歧：24/32 位延迟序列化使用十进制 34/35，解码使用 19/20；移动分别用 8 和 33。长延迟为大端，序列化的有符号 16 位 X/Y 移动值也是大端。这些情况需进一步抓包或固件验证，不能从矛盾源码静默猜测。65535 ms 内的延迟和键盘/鼠标按键/滚轮在两端一致。

## 原版布局和复制资源

原生 WinForms 客户端为 1440 ×810，主面板高 788 px。左导航宽 200 px、x=0；中心宽 1024 px、x=200；右设置宽 216 px、x=1224。左导航项为 200 ×48，y 分别是 163（Home）、213（Customize）、263（Performance）、313（Macro）、363（Power）。128 ×43 品牌图居中放在 (0,30) 的 197 ×60 控件中。

Customize 在页面相对位置 (373,9) 使用原版 471 ×565 标注鼠标图。Performance 将 309 ×565 图等比例放入 (17,−11) 的 404 ×495 控件。右配置选择器为 166 ×31、侧栏相对 (25,257)；配置恢复在 (25,318)，出厂恢复在 (25,393)，均为 166 ×33。

原版颜色：强调色 `#0080ff`；面板 `#fafafc`；正文 `#6a6a6a`；标题 `#303030`；边框 Gainsboro `#dcdcdc`；滑块轨道 `#dedede`；选中文字为白色。大多数文字为 Montserrat Medium 9 pt，标题加粗。电源卡片圆角 20 px。

用于本地复现的原版复制资源：

- `public/assets/xlite-v4.png`：原版 `Device.png`（309 ×565）。
- `public/assets/xlite-v4-customize.png`：原版 `Device_Customize.png`（471 ×565）。
- `public/assets/pulsar-logo.png`：原版 `CompanyName.png`（128 ×43）。
- `public/favicon.ico`：原版 `Config/XliteV4/AppICO.ico`，含 16、24、32、48、64、72、96、128、256 px 变体。

这些是逐字节复制，不是 AI 生成的替代图。它们来自用户提供的专有安装包，用于本地复现；不意味着发布或所有权主张。
