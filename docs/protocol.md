<!-- canonical-language: zh-CN -->

# Xlite v4 Mini 配置协议

[中文](protocol.md) · [English](en/protocol.md)

调查日期：2026-10-15；最近验收更新：2026-10-19。目标为 `3710:3401`（有线）及接收器 `3710:5402`（1K）/`3710:5403`（8K）。已在用户 Xlite v4 Mini 验证有线和 1K 通信。固件 `00.00.10.16` 时原版 8K 也完成实机测试：用户确认配对及配置/DPI 恢复可用，生产客户端经原生 HID 适配器和浏览器都在配置 8000 Hz 下完成完整读取。鼠标后来经 USB 升级至 `00.00.10.17`，未检查升级后无线重连。这些结果不测量实际 USB 报告频率，也不涵盖每种回报率和无线状态。

接收器灯光模式 2 完成浏览器保存；模式 1 完成灯光和配置的新回读，但后续完整快照在 `07/82` 超时。最后验证的模式为 1，原模式 2 未恢复。用户质疑指针速度变化后暂停接收器操作。macOS 下 2000 DPI / 8000 Hz 比 1600 DPI / 1000 Hz 体感更慢的原因未明，没有固定 DPI 的回报率对照或确认的 macOS 原因。2026-10-18 检查点通过 34 项灯光写入测试、331 项全套测试及 TypeScript/Vite 构建。当前验收和日期证据见 [验收记录](verification.md)。

固件升级和引导命令使用 [固件协议](firmware.md) 的独立输入/输出传输。2026-10-19 Chrome/WebHID USB 实测用允许列表中的官方 `1.0.1.7` 镜像完成 `00.00.10.16 → 00.00.10.17`，校验和 `0xcf00` 被接受，重启后版本确认。实际 `484d:0003` 引导器为 `usagePage 1 / usage 0`，选择器也保留厂商 usage 替代形式。独立前后读取中六个配置记录、活动性能/电源、空宏清单一致；非活动性能、非空宏保留及中断恢复未测试。实验性 8K 配对使用 [配对证据](receiver-pairing-evidence.md) 的独立输入/输出协议，不是 Feature 命令。基本配对由用户确认，失败、取消及重连变体未全部实机验证。恢复命令和宏传输源自提供的原版应用，需要明确界面操作。

## 证据与限制

检查社区实现的提交为 [`f110422b52d7ef1e91d84ca02c4da512bf7dd06d`](https://github.com/packerlschupfer/pulsar-mouse-linux/tree/f110422b52d7ef1e91d84ca02c4da512bf7dd06d)。这是作者逆向工作的直接证据，**不是厂商规范**。[Xlite v4 驱动](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/xlite_v4.py) 明示其 X2A 继承未经测试；它的 DPI 范围和 LOD 编码与本机不符，不能照搬。

随后通过 macOS hidapi 检查用户连接的 Xlite v4 Mini（VID `3710`、PID `3401`）USB 描述符及无害读取。捕获为未提交的 `.local/device-read.json`。两个厂商接口均提供无编号 64 字节 Feature 报告；设置接口通过匹配的回报率响应识别，不猜测显示名。浏览器授权和写入/回读仍须单独验收。

实机读取确认回报率、消抖字节、传感器开关、完整 DPI 块、档位颜色、LOD、LED 亮度/效果、按键 ID、电量/充电、休眠和低电量阈值。读取匹配证明格式，不证明所有值都支持。随后反编译确认宏传输和活动配置切换。固件升级独立于设置传输；破坏性恢复 API 按原版实现，但本次调查未执行。

## 报文封装

源于 [X2A 源码](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/x2a.py)，并以实际响应验证：

| 字节 | 含义 |
| --- | --- |
| 0 | 请求 `00`、处理中 `02`、完成 `01` |
| 1 | 类别 |
| 2 | 寄存器；读取时置位 bit 7 |
| 3 | 子寄存器/声明正文长度 |
| 4–5 | 零 |
| 6 | 配置 1–6；零表示活动/全局上下文，或承载响应数据 |
| 7–61 | 载荷 |
| 62–63 | 字节 0–61 之和，小端 |

USB HID Feature report ID 为 **0**。WebHID `sendFeatureReport(0, packet)` 接收 64 字节载荷，不额外添加 ID 前缀。原生 hidapi 在前面加报告 ID，不可将该惯例带入浏览器包。浏览器仅在首字节为零时容忍 65 字节响应，否则必须恰好 64 字节。[WebHID 规范](https://wicg.github.io/webhid/)

两种接收器的厂商接口均有相同描述符。实测 1K 被动 GET 在 interface 3 返回 64 字节、interface 2 返回一字节；8K 在 MI03 返回 64 字节、MI02 读取失败。对 `5402`/`5403` 候选发送任何设置查询前，客户端先在期限内检查被动响应长度；失败和短/无效报告跳过，因此实测 8K MI02 不接收设置查询。有效长度（含全零包）仅检查路由，仍须新回报率及配对身份查询。不将浏览器候选位置当 USB 接口号。配对使用证据文件中的独立双接口检查。

命令串行执行。已验证的 1K 在成功 SET_FEATURE 后首次 GET_FEATURE 前等待 30 ms；固件读取 `01/87` 等 100 ms，与原版一致。8K 同样默认 30 ms，固件和灯光 `08/89`、`08/09` 为 100 ms。实机读取通过；灯光写入 trace 确认 100 ms 初始等待，后来两种模式都完成浏览器灯光回读，但端到端结果不同，见下文。通常在 1.2 秒期限内每 20 ms 轮询 pending，不重发。有线时序不变。匹配完成状态、类别、寄存器、非零配置及命令特定档位/按键标识；使用完成响应前校验和。DPI 整块响应合法地将子寄存器 `15` 改为 `21`，不能普遍比较 sub。下述两种实测 8K 接收器本地读取例外范围严格限定；公共 `transact`、`matchesReply` 保持严格匹配。时序与旧响应见 [1K 驱动](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/xlite_v4_wireless.py) 和 [8K 传输](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/feinmann8k.py)。

只有内部 8K 配置读取的 DPI 整块 `05/84`、活动 DPI `05/81`、按键绑定 `04/81` 启用 pending 恢复。默认每 10 ms 连续观察 30 个匹配状态 `02` 后，等待 50 ms、重发相同**读取查询**、再等 50 ms 后 GET。默认总期限 3 秒，最多五次由 pending 触发的重发；明确指定的超时优先。每个 pending 必须校验和有效，或字节 1–63（含校验和）与原请求逐字节相同。后者来自实测：一条 `01/89` pending 仅将 `00` 改为 `02`，保留原请求校验和。此例外只识别 pending，不接受配置数据、不放宽完成检查。不相关响应重置连续计数；匹配但损坏的报文、终止错误、传输失败和连接改变会停止恢复。其他 getter 没有 pending 重试。公共 `transact`、全部写入、有线及 1K 读取仍不重发。

内部 8K 设置读取（含专用身份和灯光序列）另有缓存完成包恢复。客户端缓存最新通过校验和的完整完成响应，绑定设备对象和连接 epoch。新读取连续 30 次拒绝的报文若与前包 64 字节完全一致，可重发当前读取一次，发送前后各等 50 ms；旧数据绝不视作新响应。该重发共用原期限：普通读取 1.2 秒，三个配置 getter 为 3 秒。未知旧帧、前连接帧和旧状态 `05` 不触发。该有界策略由模拟 trace 覆盖，不证明原间歇 DPI 超时的根因。

恢复序列来自原生 `QD7R5XpBRr`（1953–2041 行），由 `GetButton`、`GetActiveDPI`、`GetDPIStageInfo` 调用：最多再轮询 30 次、间隔 10 ms，重发前后各等 50 ms，最多五轮。网页计数的 30 次包含初次 GET，3 秒包含 USB I/O。浏览器日志显示重复匹配 `04/81` pending，独立硬件捕获在配置 8000 Hz 下完成全读。模拟停滞读取验证恢复行为，但不能确定 DPI 修改后间歇超时原因。设置写入不重试，也未据此推断额外 DPI 写后固定等待。

匹配且校验和有效的状态 `05` 是终止错误，不是 pending。原生 `MainForm.cs` 613、7535 行将其标为离线；网页提示接收器未收到鼠标响应，不重试。不会推断休眠、配对、电源或其他链路原因。USB 层 SET_REPORT 失败是另一类传输错误。

## 寄存器

寄存器列为写地址，读地址加 `80`。前三列均为十六进制。来源：[X2A 命令](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/x2a.py)，Fusion2 例外见后文。

| 类别 | 寄存器 | Sub | 上下文 | 载荷/响应 |
| --- | --- | --- | --- | --- |
| 01 | 04 | 04 | 0 | 字节 6–7 为配对鼠标 VID u16LE，8–9 为 PID u16LE；必须为 `3710:3401` |
| 01 | 09 | 02 | 0 | 字节 7 = Hz / 125；有线/1K 为 1,2,4,8 |
| 04 | 03 | 03 | 0 | 字节 7 消抖；原版清空保留字节 8（当前读取为 3,3） |
| 07 | 04 | 02 | 0 | 字节 7 角度捕捉布尔值 |
| 07 | 03 | 02 | 0 | 字节 7 波纹控制布尔值 |
| 07 | 05 | 02 | 0 | 字节 7 Motion Sync 布尔值 |
| 07 | 02 | 03 | profile | 字节 7–8 = 选择器 2、LOD × 10 |
| 05 | 04 | 15 读 / 21 写 | profile | 活动档位、数量、五字节档位记录 |
| 05 | 01 | 02 | profile | 字节 7 为从 1 开始的活动档位 |
| 05 | 05 | 05 | profile | 档位 ID、R,G,B |
| 03 | 03 | 03 | profile | 选择器 1、亮度（0–255） |
| 03 | 04 | 0F | profile | 选择器 1；字节 8 灯效、11 呼吸速度；保留未知字节 |
| 04 | 01 | 06 | profile | 物理 ID、功能、arg1、arg2；读载荷 ID,FF |
| 08 | 01 | 01 | 0 | 字节 6 电量 0–100 或 FF（不可用） |
| 08 | 03 | 01 | 0 | 字节 6 充电布尔值 |
| 08 | 05 | 03 | 0 | 字节 7–8 休眠秒数，小端 uint16 |
| 08 | 08 | 02 | 0 | 字节 7 低电量百分比 |

电源字段推导和秒单位见 [Fusion2Power 及抓包说明](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/xlite_v4_wireless.py)。用户有线鼠标返回电量 88%、充电 1、休眠 30 秒、低电量 10%；这是观测值，不是出厂默认。电源读取可选，失败以快照警告显示。

原生 `GetBattery`（1503–1569）明确将完成电量 `FF` 映射为零，不定义为休眠或离线。网页以 `batteryPercent: undefined` 表示不可用，避免假 0% 或丢弃其他有效电源设置。其他 0–100 外的值仍报错，回归含 101、254。未知电量不能绕过下述灯光或配置校验。

LOD 使用 [8K 抓包](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/drivers/feinmann8k.py) 的新 Fusion2 格式：选择器 `02`，原始值单位 0.1 mm。本机返回 `02 0A` 即 1 mm。不可应用旧 X2A `[0,0]` / `[1,1]`。官方指南列 0.7、1、2 mm；中间十分位来自其他 Fusion2 源码，仍需本型号实机确认。

DPI 记录为 `[stage ID, X low, X high, Y low, Y high]`，数值为**直接 DPI**，不是以 100 为单位。实际读取活动档位 3，六档 400/800/1600/3200/6400/12800。原生 `GetDPIStageInfo`（2135）读取整块后，另查询 `05/81/02` 获取真实活动档位。客户端遵循该顺序，并按档位数校验独立值，不只依赖整块字节 7。官方范围 50–32,000、步长 10，各轴独立保留。[型号手册](https://www.pulsar.gg/cdn/shop/files/Manual_Xlite_v4_Quick_Guide.pdf?v=13613901784141965113)

物理按键 1/2/3/4/5/11 均读取成功。原生 `Device.ButtonID`、`MainForm.GetButtonID` 确立左/右/滚轮/**后退/前进**/DPI，纠正社区 4/5 标签颠倒。功能编码：鼠标=1；键盘=2（`arg1` 修饰位图、`arg2` HID usage）；滚动=3；DPI=9；consumer=13（小端 usage）；双击=14；禁用=0。未知绑定保留至明确编辑。[共享 HID 表](https://github.com/packerlschupfer/pulsar-mouse-linux/blob/f110422b52d7ef1e91d84ca02c4da512bf7dd06d/src/pulsar_mouse/hid.py)

## 实现/验收规则

- 打开/重连只读，不提交旧草稿。性能明确编辑走单字段即时设置；数字编辑完成提交，滑块手势结束提交，其他控件待应用。
- 即时设置从设备回读构建，不从完整草稿构建。写前检查活动配置和相关设置，外部变化需刷新。仅合并指定字段，待处理绑定、导入布局、颜色及其他草稿不提交。
- 首次写入前校验整批，不覆盖未改字段。
- 消抖遵循原版值后补零，保留未公开 LED 字节。
- 等待写完成并回读，不匹配即失败。私有 8K 灯光 setter 可由精确保留的前完成包进入强制回读，旧包不是 ACK。
- 区分本地配置/宏与设备存储；设备保存明确且需验证。
- 写失败可能留下部分修改；重读显示真实设置，异常后不报成功。
- 传输测试覆盖真实包、损坏数据、busy/旧响应、校验和拒绝、串行与断连取消。

## 署名

`src/protocol.ts`、`src/hid.ts` 是参考 MIT 项目协议事实及源码新写的 TypeScript 实现。上游许可保存在 `THIRD_PARTY_NOTICES.md`。

## 原版 Fusion 1.0.5.4 恢复

提供的 Inno 安装包内含 7z 自解压载荷，内含 .NET `Pulsar Fusion.exe`。ILSpy 9.1 将源码输出到 `.local/decompiled`；不发布原 EXE 或反编译实现。界面图片所有权按 README 保留。哈希和方法见 [提取记录](extraction.md)。

协议类 `.local/decompiled/huAZ2tYGRX2LLl1Kis/QeugLfjKJdKnv2KrF5.cs` 继承 `DriverCore.Model.FWProtocolBase`。原数组有前导报告 ID，以下偏移均减一。源码直接确认封装、配置命令、LOD、电源、LED、宏分包和消抖。网页实现按恢复的报文行为新写。

原生 `GetProfileIDList`（1437 行）发 2/82/10；响应字节 6 为数量，7 起为 ID。**实机返回六个配置 [1,2,3,4,5,6]**，覆盖社区假定的五个。`GetProfileID`（3050）用 2/86/1 及字节 6；`SetProfileID`（3078）写 2/06/1、目标在字节 6，等 500 ms。浏览器遵循等待并回读；应用整份快照要求目标确为活动配置，避免以零寻址的设置落到其他槽位。

`GetDeviceFirmwareVersion`（1340）读 1/87/4，将字节 9,8,7,6 格式化为两位十六进制。本机返回 `00.00.10.16`。

`SetDebounceTime`（3249）仅写配置和值，下一字节为零。因此网页发 `[debounce,0]`，不将第二响应字节视为独立松开延迟。`SetLiftOffDistance`（3310）确认 v4 选择器 2、单位十分之一毫米。

### 宏存储

所有宏命令类别为 6，正文从字节 6 起；这里字节 6 **不是配置**，而是宏 ID 或列表数量首字节。ID、大小、偏移和名称长度均小端。桌面程序使用 50 字节块和 UTF-16LE 名称。

| 操作 | 寄存器 / sub | 正文/响应 |
| --- | --- | --- |
| 数量 | 81 / 01 | 响应字节 6 数量 |
| 列表 | 82 / 38 | 请求总数 u16、条目偏移 u16；响应总数 u16、偏移 u16、最多 26 个 u16 ID |
| 大小 | 83 / 06 | ID u16；响应 ID u16、大小 u32 |
| 分配 | 03 / 06 | ID u16、精确字节数 u32 |
| 名称读 | 85 / 3A | ID u16、字节偏移 u16、长度 u16；名称从响应字节 12 起 |
| 名称写 | 05 / 3A | ID u16、偏移 u16、总字节长 u16、UTF-16LE 字节 |
| 数据读 | 86 / 06+length | ID u16、字节偏移 u32；数据从响应字节 12 起 |
| 数据写 | 06 / 06+length | ID u16、偏移 u32、数据 |
| 删除 | 04 / 02 | ID u16 |

先读名称长度，再从偏移零按该长度请求，不能假定首次长度响应含全部数据。匹配 ID/偏移以拒绝旧块。浏览器限制原始数据 4096 字节、名称 25 个 UTF-16 代码单元；分配前校验，写数据/名称后完整回读。既有 ID 仅在明确保存/删除时触碰。初始清单为空；后续实机创建 120 字节临时宏、完整验证内容和名称，再删除，见 [验收记录](verification.md)。

原生 `MainForm.GetFunctionID` 将宏映射为按键类型 4（第三参数次数）、5（按住）、6（切换）；参数 1/2 是宏 ID 低/高位。TypeScript 绑定含可选 `a3`，避免丢次数。事件编码单独在 `src/macro-codec.ts` 记录并测试。

### 接收器和恢复控制

`Config/my_models.csv` 将 Xlite V4 关联到 `5402`、`5403`，后者开放 2000/4000/8000 Hz，在相同寄存器编码为 16/32/64。`PulsarHidClient.maxPollingRate` 和整批校验拒绝有线/1K 超过 1000。硬件及浏览器已确认 1000 和 8000 配置，含 8000 完整快照；未测实际 USB 频率，也未系统验证每档写入/回读和稳定性。

原生 `GetDevicePID`（1472）读 1/84/4。1K 在载荷 6–9 返回 `10 37 01 34`，识别配对鼠标 `3710:3401`。接收器 ID 跨型号共用，因此允许配置前必须校验身份；仅回报率成功不证明型号。

实测 `.local/8k-read-sequence-20261018T050158Z.json` 中身份响应更新正文/sub，却保留前条类别/寄存器：polling 后 `01/89`、活动配置后 `02/86`、电量后 `08/81`。生产握手仅在 PID `5403` 新 polling 紧接着接受成功 `01/89/04` 变体，再正常校验 checksum 和 VID/PID。旧 polling 的 sub 为 `02`，拒绝。诊断 `identityReplyVariant: previous-polling-header` 记录此路径，不普遍放宽地址匹配。

`HomePageViewModel.CheckDongleRelativeModel` 初次身份查询，PID 零时再查三次。网页 1K 同样上限四次，但只在同连接仍打开且 `sendFeatureReport` 实际拒绝时重试，间隔 30 ms。离线/不支持响应、校验和错、其他型号、接收失败、I/O 超时、断连均不重试。普通写入绝不自动重发。诊断保留原错及 `identityTries`。

原生 `GetDongleIndicator`/`SetDongleIndicator`（3893/3930）用 8/89 或 09/2，字节 7 模式 1=连接、2=低电量，首次读前均等 100 ms。校验和有效的状态 4 表示不支持；仅此错误会在电源读取中省略可选灯光。无效值、校验和失败、离线和传输错误传播，不误判为无 LED。原版仅 8K 显示，读写限制 PID `5403`。

本机 8K 在低电量查询后成功的 `08/89` 灯光响应也保留 `08/88`。私有读取仅在模式 1/2、checksum 有效时接受精确 `08/88/02`；前置阈值必须 5–100%，未变阈值不能当模式。独立 `readReceiverIndicator` 也先新读阈值；一般事务和 ACK 仍严格匹配。

`.local/8k-indicator-write-browser.json` 记录独立 setter 行为：一次 `08/09/02`、配置 1、模式 2 后，51 个 GET 均逐字节等于前一有效 `02/86` 活动配置完成包，没有匹配 ACK。之前模式 1，后来独立读取模式 2，与用户灯已改变但超时一致。这证明无匹配 ACK 的实际生效，不证明修复序列成功。

仅此情况，`writePower` 先新读阈值/灯光，再单次发送 setter。等原版 100 ms 后，私有 `indicator-write` 可在 GET 精确等于同设备/epoch 前条已验证完成包时进入验证。仅限 PID `5403`、`08/09/02`、单个模式 1/2；不将包视为 ACK，也不更新完成缓存。公共 `transact` 严格，setter 不进入两种读取重发路径。匹配的不支持/离线、损坏 ACK、传输失败、无关或修改旧包仍失败。

`writePower` 完成要求全新完整电源读取的目标字段（含灯光）相等；明确配置前后检查活动槽位，全序列检查设备/epoch。旧成功包本身不能报成功，验证失败不重写。原生 `SetDongleIndicator`（3930）等 100 ms 调 `muoRu6xnuS`（1862），后者状态 1 即返回、不核地址；网页更严格。新预读将前包从实测 `02/86` 变为灯光响应，模拟测试 `tests/receiver-indicator-write.test.ts` 覆盖适配。后续 `.local/8k-indicator-write-reverify.json` 实测此保留灯光分支，再新读模式 2 和匹配活动配置；早期模式 1 通过该分支但止于电量 `255`。未知电量修复后，`.local/8k-indicator-write-final-verify.json` 记录模式 2 完整保存、模式 1 的 `writePower` 成功（新模式 1、配置 1），但模式 1 的 `writeSettings` 最终快照在 LOD `07/82` 失败，不算端到端保存通过。最后验证模式 1；用户质疑 DPI 后暂停，原模式 2 未恢复。日志和测试见 [验收记录](verification.md)。

修复后的 `.local/hardware-client-2026-10-18T05-04-48-869Z.json` 无快照警告，身份 `3710:3401`、固件 `00.00.10.16`、模式 2。34 个发送包均为读。原生适配器只验证生产协议路径，不替代浏览器授权或端到端配对/写入验收。

原生 `ResetProfile`（2251）发 2/05/1/目标配置。MainForm（4563）等 500 ms 再激活同槽；`resetProfile` 遵循并回读。此为破坏性操作，开发未执行。

该型号由 MainForm（4589）使用的原生 `Default2`（2277）发 1/0C/1、正文 2，随后等待但不 GET_FEATURE。`requestFactoryReset` 发送后 2 秒关闭连接。返回仅表示发送完成，不是回读确认恢复；用户须重连。未实际出厂恢复。

### 通知

MainForm（2344–2410）从独立 HID 通知接口接收 report ID 5。WebHID 载荷不含 ID：操作码 1 + 配置；5 + 从 1 起的档位 + DPI u16LE；13 + 信号百分比；8 + 在线标志；7 + 充电 + 电量。`parseInputReport` 实现并拒绝截断/越界。不自动绑定通用键盘/系统 collection，浏览器保护可能禁止；无信号时有线界面不能伪造强度。
