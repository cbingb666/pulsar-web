<!-- canonical-language: zh-CN -->

# 1K / 8K 接收器配对：恢复的官方行为

[中文](receiver-pairing-evidence.md) · [English](en/receiver-pairing-evidence.md)

调查日期：2026-10-18（8K）、2026-10-25（1K 扩展与用户验收）。覆盖原版 Pulsar 1K（`3710:5402`）和 8K（`3710:5403`）。最初 8K 静态调查没有硬件、未执行 USB 命令；后来有实机被动描述符/Feature 读取及经原生适配器的生产 TypeScript 路由检查，记录如下。1K 根据官方 Xlite v4 工具反编译及既有原生抓包实现。用户在本地开发页测试后，于 2026-10-25（Asia/Shanghai）确认实机通过；未保留新的 1K 原始配对抓包。agent 没有发送实机配对命令。厂商 EXE 仅下载、解包、反编译，从未运行。

当前 Xlite v4 Mini 的 8K 验收：用户确认配对，并在读取恢复修复后确认 DPI 可用；浏览器连接/读取通过。回读有 8000 Hz，不是实际 USB 频率测量。灯光模式 2 完成浏览器保存；模式 1 已写入并新回读，但最终全快照在 `07/82` 超时，该保存未端到端通过。最后验证模式为 1，恢复模式 2 前已停止硬件测试。用户后报 macOS 2000 DPI / 8000 Hz 比 1600 DPI / 1000 Hz 更慢，原因未解，未做固定 DPI 回报率对照。用户也于 2026-10-25 确认 1K 正常浏览器配对。这是用户报告的实机验收，与早期 1K 配置验收分开；没有原始 1K 状态事件，未逐个验证被动分支。原始状态帧和异常/恢复仍需单独证据。日期和边界见 [验收记录](verification.md)。

## 官方来源与复现

[官方下载页](https://www.pulsar.gg/pages/download) 列出 8K Pairing Tool V0.11（2024-10-24）和 V0.12_all（2024-12-03）。8K 下载按钮当时指向 V0.11；同页 4K eS 节链接 V0.12-all，该程序明确支持 `5403:3710` 并默认此接收器，因此 V0.12 虽在另一节，仍是 8K 直接证据。

| 文件 | 官方下载 | SHA-256 |
| --- | --- | --- |
| V0.11 ZIP | [Pulsar_8K_Pair_v0.11.zip](https://www.pulsar.gg/cdn/shop/files/Pulsar_8K_Pair_v0.11.zip?v=18144765952964520615) | `14acfa48a79e555a51a544fef13b10988803b51fe53192c1e4796f0c5cd40e2d` |
| V0.11 `Pulsar_Pair.exe` | 压缩包内 | `2c9d7cb2d55deb9825b652798f51a2c3da3559ef3a69bfc565982374b5811481` |
| V0.12 ZIP | [Pulsar_Pairing-V0.12-all.zip](https://www.pulsar.gg/cdn/shop/files/Pulsar_Pairing-V0.12-all.zip?v=6288539492894907449) | `ce3401d610814cd65ca92c6025ac61ead6c25299a7ae6593676123b6bc7a7bda` |
| V0.12 `Pulsar_Pair-V0.12.exe` | 压缩包内 | `c412092680a43abb7132bd1c357922446068eb138064a478ab5202aafc74c959` |
| Xlite v4 / XS1 ZIP，2026-10-25 获取 | [pulsar_XS1_pair.zip](https://www.pulsar.gg/cdn/shop/files/pulsar_XS1_pair.zip?v=7763943151566861443) | `606debdb2a04c5e96b5803fde1528a1b7f17d18422573ab4beef3f470679eca0` |
| Xlite v4 / XS1 `Pulsar_Pair.exe` | 压缩包内 | `5e9a0e2692f58e74ec175a8d64ad27aaf6fd8b31fa402882fc50e9f93719ec3c` |

2026-10-25 官网的 **Pairing tool for X2 v3, X2H v3, X2A v3, Xlite v4** 节链接上述 XS1 包，补充了明确列出目标鼠标的工具证据。

忽略提交的证据在 `.local/pairing/v011/`、`.local/pairing/v012/`、`.local/pairing/xs1/`。三者均为 .NET，使用已有本地运行时和 ILSpy 9.1 恢复，例如：

```sh
.local/dotnet-runtime/dotnet .local/ilspy/tools/net8.0/any/ilspycmd.dll \
  -p -o .local/pairing/v012/decompiled .local/pairing/v012/Pulsar_Pair-V0.12.exe
```

三份反编译的 `Match/UsbTool.cs` 和 `Match/HID.cs` 逐字节相同，SHA-256 分别为 `a2ba0e55059abb819e97cdf947b3c9a8700153017d885fbbdd9fd5845efcfac3`、`14c9f6be90895c6561ca02ebe8f2a2b6bdc5f404d42aadfd0f886a4b7082af74`。除说明外以下引用根目录为 `.local/pairing/v012/decompiled/`。`Match/Program.cs:13` 启动 `Pulsar2`；辅助类也包含其他产品的未用命令，须注意调用路径。

## 1K 扩展：官方调用路径与被动证据

`.local/pairing/xs1/decompiled/` 独立证明 `3710:5402` 与原版 8K 共用活动配对协议。以下引用以该目录为根：

1. `Match/Program.cs:13` 启动 `Pulsar2`。`Match/Pulsar2.cs:1004–1013` 的 `CheckPidVidInfo` 识别 `5402:3710` 并存为当前接收器。
2. `Pulsar2.cs:1029–1088` 单次调用 `WriteAllUsbSoft` 启动配对，初态 `02` 视为已配对；`Pulsar2.cs:1091–1099` 将 PID/VID 传给 `WriteDgGotoPairModelByPidVid`。
3. 相同的 `UsbTool.cs:578–621` 单次发 `48 4D 52 44 FC 24`，再读原生字节 7；`HID.cs:400`、`457` 为同步/重叠输入输出选择 `mi_02`。
4. `Pulsar2.cs:1102–1143` 最多等 30 秒，原生字节 7 的 `03`/`04` 为成功/失败。因此 1K 的输出包及去 ID 后状态偏移不变。

既有 `.local/receiver-routing-20261015T202350Z.json` SHA-256 为 `7c13642c4c5248e5a211d5b25cc8a8de946ef934f5b4ed11b98305355439ffaf`。其被动部分在设置查询前，每个接口只有**一次** GET：

| 接口 | 捕获结果 | 独立角色证据 |
| --- | --- | --- |
| MI02 | 原生大小 2（含 ID），载荷恰为一个 `00`（`:15–21`） | 官方工具选择 `mi_02` |
| MI03 | 原生大小 65（含 ID），载荷为 64 个零（`:5–11`） | 后续 polling 返回完整有效响应（`:27–39`、`:48–60`）；Fusion 选择 MI03 |

两描述符均为下述共享的 64 字节输入/输出/Feature。仅 1K，浏览器以精确单字节 `00` 识别配对候选，另一侧必须为有效设置包或精确 64 字节全零；65 字节全零可去前导 ID 后接受。要求各侧两次一致、恰好两个同支持 PID 完整候选、无不完整探测。重复两次是保守实现保护，原 1K 抓包不证明重复稳定性。全零仅在互补短响应下识别路由，不证明设置事务、鼠标身份或配置就绪。其他短长度、非零短读、未知状态、读取失败均不能识别 1K。混合 1K/8K 在探测/输出前拒绝。8K 规则独立，不接受全零或 1K 短响应。

## 配对接口和报文

配对用独立厂商 Input/Output HID 接口，不用 Fusion Feature 设置协议。`Match/HID.cs:364–418`、`421–475` 按 VID/PID、含 `mi_02` 的 Windows 路径、至少 65 字节输入/输出长度选择。代码存 usage page 但不检查，不能据此确立 WebHID usage 过滤条件。Windows 接口号不是浏览器候选索引。

早期 **1K** `.local/receiver-routing-20261015T202350Z.json` 显示 2/3 相同描述符。后来的 **8K** `.local/8k-passive-20261018T045508Z.json` 确认相同布局：`06ffff0901a1011581257f7508954009028102090391020904b182c0`，usage page `FFFF`、usage 1，MI02/MI03 都是无编号 64 字节输入/输出/Feature。这解释最初单接收器也被判歧义；仅描述符不能识别，不能以顺序或向每个候选发配对替代。

`Match/UsbTool.cs:599–621` 创建全零 65 字节 Windows 报告，原生 1–6 设十进制 `72,77,82,68,252,36`，字节 0 为零 ID。完整 WebHID 为 `sendReport(0, payload)`，载荷恰 64 字节：

```text
48 4D 52 44 FC 24 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
```

这是源码推导样本，不是硬件抓包。前四字节为 `HMRD`，没有校验和、配置、Fusion 状态或 Feature 封装。`Match/ContorlUsbHander.cs:139–173`、`Match/HID.cs:516–545` 将调用追至 Windows `WriteFile`/`ReadFile`，不是 `HidD_SetFeature`/`HidD_GetFeature`。

## 活动配对顺序

1. `Match/Pulsar2.cs:499–570` 仅在用户按 Pair 后启动，选 VID/PID 并单次调用 `WriteDgGotoPairModelByPidVid`。V0.12 支持表在 `Match/PidInfoList.cs:5`，默认 `3710:5403` 在 `Pulsar2.cs:21–23`。
2. `Match/UsbTool.cs:578–621` 打开同步接口、发上述包、等 50 ms、读一个 65 字节 Input，取原生字节 7 后关闭；WebHID 去 ID 后为字节 6。
3. 首次结果 `02` 时，`Match/Pulsar2.cs:519–528` 显示 Already paired，`:551–554` 跳过后续等待。这不新确认型号或设置通信。
4. 否则 `Pulsar2.cs:573–614` 最多等 30 秒，每轮打开 overlapped 句柄、等 30 ms 再读。原生字节 7 `03` 成功、`04` 失败，其他继续。`UsbTool.cs:683–690` 为读辅助函数。活动流程不发轮询/状态命令，不重发开始包。
5. 活动流程没有停止/取消输出命令。拔出时界面设置本地结束标志（`Pulsar2.cs` 的 `WndProc`），等待循环检查。浏览器取消只能停止监听和关闭句柄，不能声称撤回无线模式。

`UsbTool.cs:693–723` 有发同包并每 120 ms 轮询的替代函数，但 `Pulsar2` 未调用。不能混合两个路径导致启动两次。

## 源码不能证明什么

- 原版仅检查字节 7，不校验输入 ID、头、checksum 或实际长度；尤其**不能**证明响应回显 `48 4D 52 44 FC 24`。
- 输出 ID 明确为零；后续描述符证明无编号 64 字节输入，但未保留浏览器原始状态帧。原版消费带 ID 缓冲却不检查字节 0。
- 原生分配 65 字节且要求至少该容量。用户确认两种配对成功，但无原始 trace 独立验证长度/封装。拒绝损坏/截断属于浏览器保护，严格头/ID 规则须作为待抓包的实现假设记录。
- 原生首次只认 `02`，后续只认 `03`/`04`。没有明确的“已开始”ACK，不能给 `00`、`01` 等任意赋义。
- 配对完成后必须进行 Feature 身份校验（本应用 `3710:3401`）、配置读取及有效回读才能宣称就绪；仅 `03` 不识别具体鼠标。
- 本机正常 1K/8K 浏览器流程有用户确认，但硬件时序、原始状态封装、授权/错误变体、超时恢复和替换既有配对未系统验证。模拟样本只验证状态机，不确立固件事实。

## 用户准备

官方下载页要求只接目标 8K，拔其他接收器。`Match/Pulsar2.cs:965–1025` 提示连接接收器、断开鼠标数据线，同时按住左/右/滚轮三秒，确认 LED 闪烁再 Pair。按钮支持 Space/Enter（`1005` 和键盘处理），方便配对中操作。

XS1 工具同样步骤但要求**五秒**（`.local/pairing/xs1/decompiled/Match/Pulsar2.cs:324–374`），只插一个接收器在 `:440`。终点是 LED 闪烁，浏览器指导应允许 3–5 秒，不假定两工具文字相同。

[官方接收器产品页](https://www.pulsar.gg/products/8k-dongle) 列出 Xlite v4 兼容，这是此代证据，不适用于后续 LED 8K Gen.2/CrazyLight。仅支持原版 `3710:5402`、`3710:5403`，其他 ID 不在范围。

## 配对后的配置

Fusion 原生证据独立：`.local/extracted/fusion/Config/my_models.csv:7` 将 Xlite V4 关联 `5402;5403`、`1K;8K`、设置 `MI03`。`.local/decompiled/huAZ2tYGRX2LLl1Kis/QeugLfjKJdKnv2KrF5.cs:1228–1239` 使用原生 65 字节 Feature，默认初等 30 ms，回报率原值 16/32/64 对应 2000/4000/8000。`DriverCore.ViewModel/HomePageViewModel.cs:190–227` 按接收器标签/PID 选 8K 范围。

身份读取为 `01/84/04`，原生 `GetDevicePID` 在 `QeugLfjKJdKnv2KrF5.cs:1472`；固件 `01/87/04` 明确等 100 ms（1340–1371）。`GetWirelessConnectStatus`（1409）发 `09/81/10` 却无条件返回 `true`，不能当配对/连接证据。设置及兼容路径见 [配置协议](protocol.md)，验收见 [验收记录](verification.md)。

用户后来报告浏览器配对完成、普通 `01/84` 超时。只读 `.local/8k-read-sequence-20261018T050158Z.json` 身份字节有效 `10 37 01 34`，类别/寄存器却保留前响应：polling 后 `01/89`、活动配置后 `02/86`、电量后 `08/81`，被严格匹配丢弃。现在仅在新 polling 后接受实测成功 `01/89/04`，仍校验 checksum/身份，一般事务严格。灯光也有窄兼容，见 [接收器和恢复控制](protocol.md#接收器和恢复控制)。

修复后 `.local/hardware-client-2026-10-18T05-04-48-869Z.json` 原生适配完整读取无警告，身份 `3710:3401`、固件 `00.00.10.16`、配置 1、1000 Hz、电量 70%、未充电、休眠 30 秒、阈值 10%、灯光 2、空宏列表。34 个发送包全是读。此历史检查点验证修复读路径，不单独证明后续浏览器、DPI 或灯光写入结果，见下文及验收记录。

## 实机被动路由检查

2026-10-18 `.local/8k-passive-20261018T045508Z.json` 每接口两次 `GET_FEATURE(0)`，没有 Output 或 SET_FEATURE：

| 接口 | 两次被动读取 |
| --- | --- |
| 官方配对选择的 MI02 | 原生失败 `IOHIDDeviceGetReport failed: (0xE0005000)` |
| Fusion 设置选择的 MI03 | 64 字节、状态 `05`、正文其余零、校验和 `0005` |

`.local/8k-route-check.ts` 导入生产 `resolvePairingInterface`，用捕获描述符并在实机新读；适配器禁止配对输出和 Feature 写。`.local/8k-route-check-result.json` 为 `ok: true`、`selectedInterface: 2`，刻意将 MI03 先提供。验证原生适配实读，不验证实际浏览器授权/错误；适配器明确转换原生 GET 错误为以下 Chromium 错误。

[Chromium `HIDDevice::FinishReceiveFeatureReport`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/hid/hid_device.cc) 将失败读取映射为 `NotAllowedError`、消息 `Failed to receive the feature report.`，所查副本 `.local/chromium-hid-device.cc`。[WebHID 规范](https://wicg.github.io/webhid/index.html#dom-hiddevice-receivefeaturereport) 规定 `NetworkError`。resolver 只接受这些名称配合精确消息。名称不标识接口也不证明根因，仅与此双接口布局中互补、重复的有效设置响应结合使用。

## 浏览器实现与实机验收

`src/receiver-pairing.ts` 仅请求 `3710:5402`、`3710:5403`，选择器不假定 usage 过滤。共享描述符要求恰好两个同支持 PID 厂商候选，均有 64 字节输入/输出/Feature report 0。混合类型在探测前停止；依次各打开、两次探测、关闭。有效设置响应为 64 字节（可有前导零 ID）、已知状态 `01`/`02`/`04`/`05`、有效 checksum。两种布局角色规则分开：

- **1K：**恰有一侧两次精确返回单字节 `00`，另一侧重复有效设置包或已捕获的 64 字节全零。全零例外仅用于 1K 路由，不证明身份。
- **8K：**恰有一侧重复已知 Feature 读取传输失败，另一侧重复有效设置包。全零仍不足，1K 短响应不接受。

缺少兄弟接口、未知布局、不一致读取、一般错误、打开失败、超时、取消均在输出前停止。旧单候选路径仅适用于无 Feature report 0 的 Input/Output 接口，实测设备未观察此布局。用户于 2026-10-25 确认 1K 正常浏览器配对；无原始浏览器探测日志，也未逐个验收分支。

WebHID 输入异步，浏览器先注册监听，再单次发送，在统一 30 秒内等待；不复现原生阻塞初等 50 ms 或重复打开句柄。首个有效 `02` 为已配对，后来 `02` 继续等。终态 `03`/`04` 立即到达也接受，不丢快速完成。这是按原生状态语义作事件适配。失败/挂起的 `sendReport` 不能被提前输入变为成功。

只解释 report ID 0、恰 64 字节输入。其他 ID/长度仍记诊断便于后续封装调查。界面最多 100 条配对日志，导出描述符、探测和最终结果，不监听日常键鼠 collection。取消、超时、拔出、失败、成功均移除监听并关句柄；不发无线取消或固件命令。

报告完成后，仅经该次明确选择返回的其他接口配置，校验 Xlite v4 身份并读新快照后才显示就绪。失败回到断开，提供单独普通连接按钮，保留本地草稿。提示随接收器变化：1K 最高 1000，8K 可选 2000/4000/8000。用户确认 8K，原生适配和浏览器身份/读取通过；2026-10-25 也确认本地新 1K 实机正常流程。不覆盖所有路由/错误变体、原始状态帧、取消/超时、其他固件或完整写矩阵。

之后浏览器整页刷新自动连真实 8K，显示 1000 Hz、活动第 4 档 2000 DPI、消抖 0 ms、LOD 1.0 mm。刷新前虽文字更新仍是旧客户端行为。截图 `.local/8k-connected-browser.png`，该历史检查点仅验证连接/读取，不单独验证高速或灯光写入。

后来配置捕获确认 8000 Hz；用户确认 pending/旧帧恢复修复后 DPI 可用，但不证明某特定恢复分支在硬件触发，回报率寄存器也非实际频率。灯光两模式均新回读：模式 2 完整保存，模式 1 完成电源写/回读后最终 LOD `07/82` 快照失败。macOS 速度反馈单独记录。[验收记录](verification.md) 保留精确操作、最后灯光状态及待测项。
