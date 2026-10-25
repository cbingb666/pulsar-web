<!-- canonical-language: zh-CN -->

# Pulsar Fusion / Xlite v4 Mini 官方来源调查

[中文（规范源）](official-research.md) · [English](en/official-research.md)

核查日期：2026-10-15。本清单区分型号专属文档、通用 Fusion 指引和浏览器要求，不确立报文格式、不宣称实机验证。

## 型号与软件

官方下载页明确为 Xlite v4 Mini 提供 Fusion **V1.0.5.4（2025-06-26，连接优化）**。更早说明提及 DPI 档位和宏修复。固件单独下载。[Pulsar 下载](https://www.pulsar.gg/pages/download)

Xlite v4 Mini 使用 XS-1，最高 32,000 DPI，支持按键/宏编程及 Motion Sync。随附接收器为 1K；8K 需另购接收器。桌面配置软件要求 Windows。[产品页](https://www.pulsar.gg/products/xlite-v4-mini-gaming-mouse)

## 型号专属数值

目视检查官方快速指南第 1–3 页，得到：

| 设置 | 文档行为 |
| --- | --- |
| DPI | 50–32,000；步长 10；默认活动 DPI 800 |
| DPI 档位（第 2 页） | 400、800、1600、3200、6400、12800 |
| 档位颜色 | 浅蓝、蓝、浅绿、黄、橙、粉 |
| 回报率 | 125、250、500、1000 Hz；8K 接收器增加 2000/4000/8000 |
| LOD | 0.7、1、2 mm |
| 输入 | 左/右、滚轮、前进/后退、底部 DPI 键 |
| 配对手势 | 左键、右键、滚轮同时按住 3–4 秒 |

指南有矛盾：第 2 页列六档，第 3 页简表仅列 400/800/1600/3200。默认值及启用档位以实际回读为准，不能仅据文档覆盖。[官方快速指南 PDF](https://www.pulsar.gg/cdn/shop/files/Manual_Xlite_v4_Quick_Guide.pdf?v=13613901784141965113)

## 功能清单和界面证据

Pulsar 通用 Fusion FAQ 包括设备选择、语言/启动/最小化偏好、固件/电量、按键、消抖、休眠、配置、导入/导出/恢复、Motion Sync、DPI 档位、回报率、灵敏度、LOD、双击速度、角度捕捉、波纹控制、DPI 灯颜色/亮度/效果及宏录制/编辑/分配。截图却为较早的 **Fusion Wireless Mice V1.2.7**，准确版本控件须以提供的 EXE 为准。FAQ 的三档说法也与 Xlite v4 指南冲突。[官方 Fusion FAQ](https://eu.pulsar.gg/pages/faq)

产品页软件图为浅色、蓝色强调色，左导航 **HOME / CUSTOMIZE / PERFORMANCE / MACRO**，右侧为语言/设备/配置及应用设置。[官方软件图](https://www.pulsar.gg/cdn/shop/files/Pulsar_mouse_software_N1.png?v=1721033524)

补充官方截图（较旧深色界面，仅用于功能分组参考）：

- [设备选择](https://eu.pulsar.gg/cdn/shop/files/UwrNK_Sz2oDLxHAtnofOhLGFvg7tMpsAzw.png?v=1725342755)
- [应用偏好，明确为 V1.2.7](https://eu.pulsar.gg/cdn/shop/files/Or6qHa6UvXCzDQCvfXXhZ4_RZ6z3ZcuZYg.png?v=1725342796)
- [按键/性能](https://eu.pulsar.gg/cdn/shop/files/awUFYBPFHyja7-IpG2nPftmrUel2rqYznw.png?v=1725342813)
- [宏界面](https://eu.pulsar.gg/cdn/shop/files/0K8nnWKSEMn5SDdLUziXKZsPFlPdaO19fQ.png?v=1725342829)

## 浏览器限制

WebHID 支持 Input、Output、Feature 报告，权限可按 USB 厂商/产品和 HID usage 筛选。须检查返回的每个 HID 接口及 `collections`，再打开厂商配置接口。Chrome 保护通用键鼠 collection；可访问鼠标不等于可访问普通移动/按键报告。Feature 可双向配置，但格式为设备专属。`sendFeatureReport(reportId, payload)` 将 ID 与载荷分开，不同于在前面加 ID 的原生库。支持重连/断连事件及已授权设备。[Chrome WebHID 指南](https://developer.chrome.com/docs/capabilities/hid)

API 要求安全上下文，设备请求要求短暂用户激活。因此新授权需 HTTPS 或可信本地开发源的用户触发选择器，不能静默取得新设备。Chrome/Edge 等桌面 Chromium 浏览器提供 WebHID，具体浏览器可能禁用。[规范](https://hid.spec.whatwg.org/)、[实现状态](https://github.com/whatwg/hid)

`receiveFeatureReport()` 返回操作系统报告数据。首字节**可能**包含 report ID，标准不保证总有。应按已知报告布局校验长度和封装，不能盲目删除字节零。[规范源码](https://github.com/whatwg/hid/blob/main/index.html)

实现推论：Windows 启动/最小化及系统灵敏度/双击/滚轮不能等同设备配置。网页须标明边界，不能假装本地滑块改变系统。宏捕获仅限活动页面收到的事件；设备存储宏播放是另一项需验证的协议功能。

## 官方网页和协议证据

Pulsar 提供 [BIBIMBAP](https://bbb.pulsar.gg/)。其公开 [配置](https://bbb.pulsar.gg/cfg.json) 当时为 1.2.3 和 USB 允许列表，含厂商 `0x3710`，但**没有本机产品 `0x3401`**。它的存在不能证明支持此 Xlite v4。公开 JavaScript 调用 WebHID；所查厂商页面未找到官方 Xlite v4 协议规范。[公开应用包](https://bbb.pulsar.gg/js/app.3283b4c5.js)

另发现社区 [pulsar-mouse-linux](https://github.com/packerlschupfer/pulsar-mouse-linux)。这是属于其作者的有用实现证据，**不是厂商协议保证**；相关命令仍需与提供的 Fusion 二进制和实机响应对照。

## 验收要求

- 初态、档位数量、可用回报率和固件选项以设备回读为准。
- 写配置须传输完成，支持时还需目标回读匹配才算成功。
- 有线与接收器单独测试，8K 能力取决于实际接收器。
- 区分本地配置/宏编辑和已确认设备存储。
- 未将每个可见控件与 Fusion 和实机对照前，不宣称完全等价。
