<!-- canonical-language: zh-CN -->

# 文档索引

[中文（规范源）](README.md) · [English](en/README.md)

**中文是唯一规范源；英文仅为译本。** 修改事实时先修改根目录 `README.md` 或本目录对应中文文件，再同步 `README.en.md` / `docs/en/`。译本顶部的源路径和 SHA-256 用于检测过时；`npm run docs:check` 校验覆盖、同步状态和本地链接。哈希不能替代语义审阅。完整维护步骤见 [项目说明](../README.md#语言与文档维护)。

| 文档 | 内容 |
| --- | --- |
| [启动与使用](../README.md) | 安装、连接、功能、配对/刷写操作、边界及许可 |
| [配置协议](protocol.md) | Feature 报文、寄存器、读写验证与接收器兼容 |
| [接收器配对](receiver-pairing-evidence.md) | 官方来源、1K/8K 路由、Input/Output 配对与边界 |
| [固件刷写](firmware.md) | 允许文件哈希、DCDU、接口与实机升级证据 |
| [宏编码](macro-protocol.md) | 字节流、循环绑定和未解决的原版矛盾 |
| [原版文件](native-files.md) | Fusion CSV 兼容和 Web JSON 边界 |
| [验收记录](verification.md) | 按日期保留的实机/浏览器/模拟证据及未验证项 |
| [静态提取](extraction.md) | 提取链、文件哈希与型号资源 |
| [原版应用证据](native-evidence.md) | .NET 控件、协议和能力证据 |
| [资源功能清单](feature-inventory.md) | 资源键、原版图片与桌面专属功能 |
| [官方来源调查](official-research.md) | 型号手册、官网、浏览器约束与证据限制 |

[MIT 许可](../LICENSE) 和 [第三方声明](../THIRD_PARTY_NOTICES.md) 保留许可原文；Pulsar 专有资源不因项目采用 MIT 而获得再分发许可。文档国际化不更改协议数据或原始证据中的字符串。
