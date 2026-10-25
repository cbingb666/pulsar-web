<!-- canonical-language: zh-CN -->

# 原版文件兼容性

[中文（规范源）](native-files.md) · [English](en/native-files.md)

提取的 1.0.5.4 `MainForm` 只有两个文件对话框，均针对宏 CSV：`fIxcgXPaRc` 导入、`jaJcMTrhgE` 导出、`ExportListViewToCSV` 序列化、`DbgcQTtOC6` 解析（反编译行 9220–9370）。该版本没有发现配置文件导入/导出对话框；Web 应用额外提供自己的 JSON 配置备份。

原版宏行为不带引号的 `ImageIndex,Text[,KeyCode]`，表头以 `ImageIndex,` 开始。索引 0 为秒数，1/2 为键盘按下/松开，3 为鼠标/滚轮/移动事件。按键文本为准：可选数字列有时是 Windows 键码，有时是 USB usage。键名遵循 `KDLoSFJ1tZc2p1kSIM.aceaRr3Y4h`。

Web 应用导入/导出已验证的键盘、修饰键、鼠标按键、滚轮和延迟行。移动事件因原版编码/解码操作码不一致而拒绝。导入能识别原版逗号键行；原版解析器不支持引号，因此包含逗号键时拒绝 CSV 导出并建议 JSON。原版 CSV 和导入器都不保存循环方式；循环属于鼠标按键映射。

验证：`tests/native-files.test.ts` 检查原版行语义、支持事件的往返转换，并保证不支持/损坏内容被整体拒绝。本 macOS 环境没有运行 Windows 原版应用。
