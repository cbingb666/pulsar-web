<!-- canonical-language: zh-CN -->

# 原版宏编码证据

[中文](macro-protocol.md) · [English](en/macro-protocol.md)

来源为用户提供的 `PulsarFusionDrvSetup_Ver1.0.5.4.exe`，提取托管程序集并反编译到 `.local/decompiled/`。推导此编解码器时没有向设备写入报文。传输层单独处理类别 6。

## 事件流

`DriverPro/MainForm.cs` 的 `f8hSzE51ql`（约 7890–8100 行）直接序列化列表，没有流头或终止符。`rn7S0ocQy7`（约 7270–7450 行）负责解析。`IgZLda7sS0 = 1000`（1610 行）限制原版界面事件数。

| 事件 | 字节 |
| --- | --- |
| 键盘按下/松开 | `03 keycode` / `04 keycode` |
| 修饰键按下/松开 | `05 mask` / `06 mask` |
| 鼠标按下/松开 | `01 mask` / `02 mask` |
| 滚轮向上/向下 | `0B 01` / `0B FF` |
| 延迟 0–255 ms | `0C ms` |
| 延迟 256–65535 ms | `0D low high` |

键值来自 `hj77R4ovCABOvece7H/KDLoSFJ1tZc2p1kSIM.cs` 的 `aceaRr3Y4h` 和 `eCHaZ05odA`，不能将浏览器键盘数字直接当作原生键码。修饰键掩码由 `DriverCore.Model/Device.cs` 和 `MainForm.GetModifierKeyFromString` 定义：左 Control/Shift/Alt/GUI 为 1/2/4/8，右侧为 16/32/64/128。鼠标左/右/中/后退/前进为 1/2/4/8/16；DOM 的右键/中键顺序不同。

更长的本地延迟拆分为多个已支持的 <=65535 ms 事件，保持总时长，并检查展开后的原生事件数不超过 1000。

## 明确未解决的原版不一致

- 原版写入器对 24/32 位延迟输出十进制 `34/35`，读取器却识别 `19/20`。Web 编解码器不猜测固件支持哪一种；写入拆为无歧义的 u16 延迟，导入拒绝这些有歧义的编码。
- 原版移动写入器使用十进制操作码 `8`，读取器识别 `33`；该分支的有符号解码也不寻常。遇到此类流明确报错，不静默丢失事件。
- 原版鼠标松开读取器沿用前一次按下的按键，尽管写入器存储了按键掩码。Web 编解码器遵循每个明确字节，不复现这一疑似界面解析错误。
- 在独立验证前，拒绝组合鼠标/修饰键掩码、未知键盘键码和非单位滚轮值。

## 循环行为属于按键绑定

`MainForm.GetFunctionID`（约 4250–4290 行）的分配如下：

| 本地模式 | 原生功能 | 参数 |
| --- | --- | --- |
| once | 4 | 小端 u16 宏 ID，次数 1 |
| repeat | 4 | 小端 u16 宏 ID，次数 1–255 |
| whilePressed | 5 | 小端 u16 宏 ID |
| toggle | 6 | 小端 u16 宏 ID |

`.local/extracted/Language-XliteV4.utf8.ini` 中的 `MacroITips`、`MacroIITips`、`MacroIIITips`（中文 110–112 行、英文 276–278 行）确认其语义。宏字节流不包含循环配置。因此只从设备存储导入宏时，在检查对应按键绑定前无法知道其循环方式。

## API

`encodeNativeMacro({events})` 返回 `number[]`；`decodeNativeMacro(data)` 返回 `MacroEvent[]`。`macroBinding(id, {loopMode, repeatCount})` 返回与 HID 客户端 `ButtonBinding` 兼容的绑定；`decodeMacroBinding(binding)` 恢复 ID 和播放行为。

这些函数仅进行内存转换。设备存储、可用容量、名称限制、写入回读验证和界面上传状态由传输层与应用层负责。单元测试使用原版分支推导的明确字节样本，并覆盖损坏流和边界；硬件行为仍须单独验收。
