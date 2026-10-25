// Chinese source messages are the keys; maintain English translations only here.
export const englishMessages: Readonly<Record<string, string>> = {
  "正在自动保存…": "Saving automatically…",
  "修改 DPI 会自动保存当前档位布局；其他草稿仍需应用。": "Editing DPI automatically saves the current stage layout. Other drafts still require Apply.",
  "请等待设备操作完成后再导入配置。": "Wait for the device operation to finish before importing a profile.",
  设备概览: "Device overview",
  按键设置: "Button settings",
  性能设置: "Performance",
  宏编辑器: "Macro editor",
  电源管理: "Power management",
  配置管理: "Profiles",
  左键: "Left button",
  右键: "Right button",
  滚轮中键: "Middle button",
  "侧键 · 后退": "Side button · Back",
  "侧键 · 前进": "Side button · Forward",
  "底部 DPI 键": "Bottom DPI button",
  打开设备: "Open device",
  检查报告长度: "Check report length",
  读取回报率: "Read polling rate",
  校验配对型号: "Verify paired model",
  连接成功: "Connected",
  "Pulsar Xlite v4 鼠标": "Pulsar Xlite v4 mouse",
  "Xlite v4 按键位置示意": "Xlite v4 button layout",
  "选择{0}": "Select {0}",
  "鼠标已断开。编辑的配置仍保留在浏览器中。":
    "Mouse disconnected. Your edited profiles remain in this browser.",
  "浏览器本地存储不可用，请导出配置备份。":
    "Browser storage is unavailable. Export a profile backup.",
  "宏保存失败，请导出备份。": "Could not save macros. Export a backup.",
  "更改已暂存。请先重新读取设备，恢复自动保存。":
    "Change kept as a draft. Read the device again to resume automatic saving.",
  "{0}未写入：{1}": "{0} was not written: {1}",
  "{0}未确认生效：{1}。已暂停自动保存，请重新读取设备检查实际值。":
    "Could not confirm {0}: {1}. Automatic saving is paused. Read the device again to check its actual settings.",
  "请在浏览器中选择目标 USB 设备…":
    "Select the target USB device in the browser…",
  固件刷写: "Firmware flashing",
  "刷写会话已结束，请重新检查设备状态":
    "The flashing session has ended. Check the device state again.",
  "鼠标当前版本 {0} 高于所选固件，本流程不支持降级。":
    "The mouse version {0} is newer than the selected firmware. Downgrading is not supported.",
  "正在让鼠标进入升级模式…": "Entering mouse upgrade mode…",
  "升级模式命令已发送。保持 USB 连接，等待设备重新出现后，点击“选择引导设备并刷写”继续。":
    "Upgrade mode command sent. Keep USB connected, wait for the device to reappear, then click “Select bootloader and flash”.",
  "正在打开升级通道…": "Opening upgrade channel…",
  "正在擦除固件…": "Erasing firmware…",
  "正在准备传输…": "Preparing transfer…",
  "正在写入固件，请保持连接…": "Writing firmware. Keep the device connected…",
  "正在校验设备中的固件…": "Verifying firmware on the device…",
  "正在重启鼠标…": "Restarting mouse…",
  "正在处理固件…": "Processing firmware…",
  "设备校验通过，重启命令已发送。等待鼠标重新出现后，点击“重新连接鼠标并验证”；版本回读通过后才会显示完成。":
    "Device verification passed and restart command sent. Wait for the mouse to reappear, then click “Reconnect mouse and verify”. Completion requires version readback.",
  "固件版本尚未确认：设备返回 {0}，期望 {1}。请确认选择了刚刚刷写的有线鼠标。":
    "Firmware version is not confirmed: device returned {0}, expected {1}. Select the wired mouse you just flashed.",
  "固件刷写完成，设备版本 {0} 已回读确认。配置已重新读取，本地草稿保留；设备宏可在宏编辑器刷新。":
    "Firmware flashing completed. Device version {0} confirmed by readback. Settings reloaded and local drafts preserved. Refresh device macros in the macro editor.",
  " 尚未进入升级模式，可重新选择目标有线鼠标。":
    " Upgrade mode has not been entered. Select the target wired mouse again.",
  " 未确认刷写完成。请保持供电，重新选择引导设备重试。若设备仍显示 Xlite v4，可返回第一步。":
    " Flashing completion is not confirmed. Keep power connected and select the bootloader again to retry. If the device still appears as Xlite v4, return to step one.",
  " 未确认刷写完成。请保持供电，等待鼠标重新出现后，再次连接验证；若仍只显示引导设备，请返回刷写步骤。":
    " Flashing completion is not confirmed. Keep power connected, wait for the mouse to reappear, then reconnect and verify. If only the bootloader appears, return to the flashing step.",
  "请在浏览器选择 1K 或 8K 接收器并授权…":
    "Select and authorize a 1K or 8K receiver in the browser…",
  配对接收器: "Pair receiver",
  "1K Dongle 或 8K Dongle": "1K Dongle or 8K Dongle",
  "配对未开始，已取消设备选择":
    "Pairing has not started. Device selection was cancelled.",
  "已停止配对后的连接检查，请重新连接鼠标":
    "Post-pairing connection checks stopped. Reconnect the mouse.",
  "接收器已返回配对状态，正在校验 Xlite v4 并读取配置…":
    "Receiver returned a pairing status. Verifying Xlite v4 and reading settings…",
  "设备宏读取失败，可稍后在宏编辑器重试。":
    "Could not read device macros. Retry in the macro editor later.",
  "读取设备宏期间连接已断开，请重新连接检查状态":
    "Disconnected while reading device macros. Reconnect to check the state.",
  "现在可以选择 2000 / 4000 / 8000 Hz":
    "You can now select 2000 / 4000 / 8000 Hz",
  "1K 接收器最高支持 1000 Hz": "The 1K receiver supports up to 1000 Hz",
  "{0}，已确认 Xlite v4 并读取配置。{1}；本地草稿已保留。{2}{3}":
    "{0}. Xlite v4 verified and settings loaded. {1}. Local drafts preserved. {2}{3}",
  接收器已有配对: "Receiver was already paired",
  配对成功: "Pairing succeeded",
  "自动连接偏好未能保存。":
    "Could not save the automatic connection preference.",
  "接收器报告{0}，但尚未完成配置连接。请关闭此窗口后点击“连接鼠标”，选择 {1} 重新校验。{2}":
    "Receiver reports {0}, but the settings connection is not complete. Close this dialog, click “Connect mouse”, and select {1} to verify again. {2}",
  已有配对: "already paired",
  配对完成: "pairing complete",
  正在自动连接设备: "Connecting automatically",
  连接并读取设备: "Connect and read device",
  "{0}并读取设备。若此配置有未应用的本地草稿，草稿已保留，请确认后应用。{1}":
    "{0} and read the device. Any unapplied local draft for this profile has been preserved. Review it before applying. {1}",
  已自动连接: "Automatically connected",
  已连接: "Connected",
  "浏览器未能保存自动连接偏好，下次可能仍需手动连接。":
    "The browser could not save the automatic connection preference. You may need to connect manually next time.",
  读取设备配置: "Read device settings",
  "已读取鼠标的最新配置。": "Latest mouse settings loaded.",
  写入并回读验证: "Write and verify by readback",
  "设置已写入鼠标，并通过设备回读验证。":
    "Settings written to the mouse and verified by readback.",
  "{0}。部分设置可能已写入，请先重新读取设备。":
    "{0}. Some settings may have been written. Read the device again first.",
  "请先应用当前更改，或点击“重新读取”放弃更改。":
    "Apply the current changes first, or click “Read again” to discard them.",
  切换设备配置: "Switch device profile",
  "已切换并读取设备配置 {0}。":
    "Switched to device profile {0} and loaded its settings.",
  读取设备宏: "Read device macros",
  上传并回读验证宏: "Upload and verify macro",
  设备宏编号已用尽: "No device macro IDs remain available.",
  "{0}。宏可能已经部分写入（ID {1}），请刷新设备宏检查。":
    "{0}. The macro may have been partially written (ID {1}). Refresh device macros to check.",
  "宏“{0}”已写入设备并回读验证。可在按键设置中分配。":
    "Macro “{0}” written and verified by readback. Assign it in button settings.",
  读取设备宏内容: "Read device macro contents",
  "本地宏库已达128个上限，请先导出整理":
    "The local library has reached its 128-macro limit. Export and organize it first.",
  "设备宏已导入本地宏库。循环方式由按键绑定决定。":
    "Device macro imported into the local library. Its loop mode is determined by the button binding.",
  "删除设备中的宏？": "Delete this device macro?",
  "将先检查全部设备配置的按键绑定。仍被使用的宏不会删除。":
    "All device profiles will be checked for button bindings first. A macro still in use will not be deleted.",
  检查绑定并删除设备宏: "Check bindings and delete device macro",
  "配置 {0} 的按键仍在使用此宏，请先解除绑定":
    "A button in profile {0} still uses this macro. Remove the binding first.",
  "设备宏已删除，删除前的原始内容已导出备份。":
    "Device macro deleted. Its original contents were exported as a backup first.",
  "已导出当前配置。": "Current profile exported.",
  配置文件过大: "Profile file is too large.",
  "已导入到本地草稿。连接设备后点击“应用到鼠标”写入。":
    "Imported into the local draft. Connect the device and click “Apply to mouse” to write it.",
  有待应用的更改: "Unapplied changes",
  设备配置已同步: "Device settings synchronized",
  等待读取配置: "Waiting to read settings",
  本地编辑模式: "Local editing mode",
  连接后读取: "Read after connecting",
  等待读取电量: "Waiting for battery status",
  正在充电: "Charging",
  电量未知: "Battery level unknown",
  "电量偏低，请及时充电": "Battery low. Charge soon.",
  使用电池: "On battery",
  设备工作台: "DEVICE WORKSPACE",
  连接诊断: "Connection diagnostics",
  使用帮助: "Help",
  "设备 ": "Device ",
  "USB 已连接": "USB connected",
  "1K 接收器已连接": "1K receiver connected",
  "8K 接收器已连接": "8K receiver connected",
  设备未连接: "Device disconnected",
  断开设备: "Disconnect device",
  "已断开。刷新或重新打开页面后也不会自动连接，直到你再次手动连接成功。":
    "Disconnected. Automatic connection stays off across reloads until you successfully connect manually again.",
  "已断开，但浏览器未能保存连接偏好，刷新后可能再次自动连接。":
    "Disconnected, but the browser could not save this preference. It may reconnect automatically after a reload.",
  断开: "Disconnect",
  连接鼠标: "Connect mouse",
  "调整 DPI、回报率、抬起高度与点击响应。":
    "Adjust DPI, polling rate, lift-off distance, and click response.",
  "为鼠标按键分配动作或快捷键。":
    "Assign actions or shortcuts to mouse buttons.",
  "录制、编辑和上传宏。":
    "Record, edit, and upload macros.",
  "查看电量，调整休眠与低电量设置。":
    "Check battery level and adjust sleep and low-battery settings.",
  "切换设备配置，导入和导出本地备份。":
    "Switch device profiles and import or export local backups.",
  "查看 DPI、回报率和电量。":
    "View DPI, polling rate, and battery level.",
  "查看浏览器支持、设备连接与通信记录。":
    "Inspect browser support, device connections, and communication logs.",
  "重新读取设备（放弃本地更改）": "Read device again (discard local changes)",
  重新读取设备: "Read device again",
  "当前浏览器不支持设备连接。请在桌面版 Chrome 或 Edge 中通过 localhost 或 HTTPS 打开；你仍可编辑和导出本地配置。":
    "This browser cannot connect to the device. Open this page in desktop Chrome or Edge over localhost or HTTPS. You can still edit and export local profiles.",
  "连接鼠标后读取真实设置。当前显示的是本地草稿，尚未写入设备。":
    "Connect the mouse to read its actual settings. The current view is a local draft that has not been written to the device.",
  "连接设备 ": "Connect device ",
  "使用 USB 或无线接收器连接并配置鼠标。":
    "Connect and configure the mouse using USB or a wireless receiver.",
  "调整性能 ": "Adjust performance ",
  "最大 DPI": "Maximum DPI",
  当前有线最高回报率: "Maximum wired polling rate",
  "当前 DPI": "Current DPI",
  回报率: "Polling rate",
  " ms 报告间隔": " ms report interval",
  设备电量: "Device battery",
  "查看电量详情 ": "Battery details ",
  快速开始: "Quick start",
  "性能设置自动保存":
    "Performance settings save automatically",
  "连接并读取后，性能设置自动保存":
    "Performance settings save automatically after connecting and reading the device",
  "所有性能设置均自动保存。DPI 数值按 Enter 或离开输入框时保存；颜色选择完成、滑块调节结束后保存。":
    "All performance settings save automatically. DPI values save on Enter or when you leave the field; colors save when selected, and sliders save when adjustment ends.",
  "DPI 灵敏度": "DPI sensitivity",
  "点击编号切换当前档位；数值编辑完成后自动应用。":
    "Click a stage number to switch. Values apply when editing is finished.",
  "DPI 档位 ": "DPI stages ",
  "关联 X / Y 轴": "Link X / Y axes",
  "选择 DPI 档位 {0}": "Select DPI stage {0}",
  "DPI 档位": "DPI stage",
  "档位 {0} 颜色": "Stage {0} color",
  "DPI 指示灯颜色": "DPI indicator color",
  移除档位: "Remove stage",
  "移除档位 {0}": "Remove stage {0}",
  "档位 {0} X DPI": "Stage {0} X DPI",
  "第 {0} 档 DPI": "Stage {0} DPI",
  "档位 {0} Y DPI": "Stage {0} Y DPI",
  "第 {0} 档 Y DPI": "Stage {0} Y DPI",
  当前档位: "Active stage",
  "50 – 32,000 DPI · 步长 10 · 档位增删和颜色自动保存":
    "50–32,000 DPI · Step 10 · Stage layout and colors save automatically",
  添加档位: "Add stage",
  每秒向电脑报告位置的次数:
    "Position reports sent to your computer each second",
  "有线和 1K 接收器最高 1000 Hz；8K 接收器支持 2000 / 4000 / 8000 Hz。8K 高回报率为实验性功能，实际报告频率尚未测量；如有异常请改用 1000 Hz。":
    "Wired and 1K receivers support up to 1000 Hz; 8K receivers support 2000 / 4000 / 8000 Hz. Higher polling rates on 8K receivers are experimental; the actual report rate has not been measured. Switch to 1000 Hz if you encounter problems.",
  抬起高度: "Lift-off distance",
  鼠标离开表面时的停止追踪高度: "Height above the surface where tracking stops",
  "当前值：": "Current value: ",
  传感器设置: "Sensor settings",
  "同步传感器数据与 USB 报告时序":
    "Synchronize sensor data with USB report timing",
  角度捕捉: "Angle snapping",
  "Angle Snapping · 修正移动轨迹": "Angle Snapping · Straighten movement paths",
  波纹控制: "Ripple control",
  "Ripple Control · 平滑传感器数据": "Ripple Control · Smooth sensor data",
  点击响应: "Click response",
  调整点击去抖动的时间: "Adjust the click debounce interval",
  消抖时间: "Debounce",
  "较低的时间可能增加重复点击的概率。":
    "Lower values may increase the chance of double clicks.",
  "DPI 指示灯": "DPI indicator",
  "选择灯效后自动保存；亮度和呼吸速度调节结束后保存。":
    "Lighting effects save on selection; brightness and breathing speed save when adjustment ends.",
  灯光效果: "Lighting effect",
  关闭灯光: "Off",
  常亮: "Steady",
  呼吸: "Breathing",
  亮度: "Brightness",
  呼吸速度: "Breathe speed",
  按键分配: "Button assignments",
  "点击鼠标上的编号，或从列表中选择按键。":
    "Click a number on the mouse or choose a button from the list.",
  分配动作: "Assigned action",
  分配按键动作: "Assign button action",
  "键盘按键 / 组合键…": "Keyboard key / shortcut…",
  "按住锁定 DPI…": "Hold to lock DPI…",
  录入快捷键: "Capture shortcut",
  "点击此区域，然后按下一个按键或组合键。":
    "Click here, then press a key or shortcut.",
  取消: "Cancel",
  "锁定 DPI": "DPI lock",
  设置锁定值: "Set lock value",
  设备宏: "Device macros",
  分配设备宏: "Assign device macro",
  "选择已上传的宏…": "Select an uploaded macro…",
  运行方式: "Playback mode",
  宏运行方式: "Macro playback mode",
  执行一次: "Run once",
  重复指定次数: "Repeat a set number of times",
  按住时循环: "Loop while held",
  再次按下停止: "Press again to stop",
  次数: "Count",
  宏重复次数: "Macro repeat count",
  "至少保留一个左键。设备宏的循环方式由按键绑定决定。修改后请应用到鼠标。":
    "Keep at least one left button. Macro loop mode is set by its button binding. Apply changes to the mouse when finished.",
  剩余电量: "Battery remaining",
  连接方式: "Connection type",
  设备已连接: "Device connected",
  等待连接: "Waiting for connection",
  固件版本: "Firmware version",
  从设备读取: "Read from device",
  电源设置: "Power settings",
  "应用后将保存到设备，并重新读取确认。":
    "Apply to save to the device and verify by readback.",
  自动休眠: "Automatic sleep",
  闲置多久后进入节能状态: "Idle time before entering power-saving mode",
  自动休眠时间: "Automatic sleep timeout",
  "30 秒": "30 seconds",
  "{0} 分钟": "{0} min",
  低电量模式阈值: "Low-battery threshold",
  "8K 接收器指示灯": "8K receiver indicator",
  "实验性设置；切换到“显示连接状态”后，读取完整配置可能超时。请重新读取检查。":
    "Experimental setting. Reading all settings may time out after switching to “Show connection status”. Read the device again to check the result.",
  接收器指示灯模式: "Receiver indicator mode",
  显示连接状态: "Show connection status",
  仅低电量提醒: "Low-battery alerts only",
  "连接并读取设备后，可调整休眠与低电量设置。":
    "Connect and read settings to adjust sleep and low-battery options.",
  固件: "Firmware",
  "当前版本：": "Current version: ",
  刷写鼠标固件: "Flash mouse firmware",
  查看固件刷写进度: "View flashing progress",
  "打开 Pulsar 官方下载页面 ": "Open Pulsar downloads ",
  配置库: "Profile library",
  "连接后选择配置会切换鼠标的活动槽位，并读取对应设置。":
    "When connected, selecting a profile switches the mouse slot and reads its settings.",
  导入与导出: "Import and export",
  "使用 Web 版 JSON 配置格式，保留完整按键、DPI、灯光与传感器设置。":
    "The Web JSON format preserves button, DPI, lighting, and sensor settings.",
  配置名称: "Profile name",
  导入配置: "Import profile",
  导出配置: "Export profile",
  "配置 JSON 为 Web 版格式；原版宏 CSV 请在宏编辑器导入。导入配置后需应用才会写入设备。":
    "Profile JSON uses this Web app’s format. Import original macro CSV files in the macro editor. Imported profiles must be applied before they are written to the device.",
  设备恢复: "Device reset",
  "直接恢复设备设置。执行前请导出需要保留的配置。":
    "Reset device settings directly. Export any settings you want to keep first.",
  "恢复当前设备配置？": "Reset the current device profile?",
  "将恢复当前槽位及关联性能参数。当前配置会先导出备份；其他槽位不作为本次恢复目标。":
    "The current slot and related performance settings will be reset. Its settings will be exported as a backup first. Other slots are not reset by this operation.",
  恢复设备配置: "Reset device profile",
  "设备配置已恢复并重新读取。": "Device profile reset and read again.",
  恢复当前配置: "Reset current profile",
  "将鼠标恢复出厂设置？": "Restore mouse factory settings?",
  "此操作会清除设备内的自定义设置，并断开连接。请先导出所有需要的配置及宏。此功能为实验性，尚未完成实机验证；执行后请重新连接并检查配置和宏。":
    "This clears custom settings on the device and disconnects it. Export all profiles and macros you need first. This feature is experimental and has not been verified on hardware. Reconnect afterward and check profiles and macros.",
  发送出厂恢复命令: "Send factory reset command",
  "出厂恢复命令已发送。设备已断开，请重新连接并检查实际状态。":
    "Factory reset command sent. Device disconnected. Reconnect and check its actual state.",
  恢复出厂设置: "Factory reset",
  连接状态: "Connection status",
  支持: "Supported",
  不可用: "Unavailable",
  安全上下文: "Secure context",
  是: "Yes",
  否: "No",
  设备: "Device",
  未连接: "Disconnected",
  配置通道: "Settings channel",
  验证方式: "Verification",
  "报文校验 + 写入后回读": "Report validation + readback after writing",
  "1K / 8K 接收器先被动检查报告长度，再通过新的只读查询确认配置通道和配对型号。 若连接失败，请关闭其他配置网页或软件，重新插拔接收器后重试。":
    "1K / 8K receivers first pass a passive report-length check, then fresh read-only queries verify the settings channel and paired model. If connection fails, close other configuration pages or software, unplug and reconnect the receiver, then retry.",
  最近一次连接尝试: "Latest connection attempt",
  "按浏览器返回的候选通道编号，便于定位失败阶段。":
    "Candidate channel numbers follow the browser’s order to help locate the failure stage.",
  "通道 ": "Channel ",
  " · {0} 字节": " · {0} bytes",
  "连接设备后，这里会保留每个候选通道的结果；连接失败也可导出诊断。":
    "Results for each candidate channel appear here after a connection attempt. Diagnostics can also be exported after a failed connection.",
  通信记录: "Communication log",
  "仅记录本页与鼠标的配置报文，不记录日常键鼠输入。":
    "Only this page’s device configuration reports are logged. Everyday keyboard and mouse input is not recorded.",
  导出诊断: "Export diagnostics",
  "连接鼠标后，通信记录会显示在这里。":
    "Communication logs appear here after connecting the mouse.",
  完整诊断数据: "Full diagnostic data",
  "Pulsar · 未连接": "Pulsar · Disconnected",
  当前配置: "Current profile",
  "连接后选择配置会切换设备槽位。未连接时仅编辑本地草稿。":
    "Selecting a profile while connected switches the device slot. Offline changes only edit local drafts.",
  导入: "Import",
  导出: "Export",
  "配置保存在本机":
    "Profiles stored locally",
  "Chrome / Edge 通过 WebHID 连接。配置保留在本机浏览器，无需账号。":
    "Chrome / Edge connects via WebHID. Profiles stay in this browser. No account required.",
  "已将本地草稿恢复为默认值。尚未修改鼠标。":
    "Local draft restored to defaults. The mouse has not been modified.",
  恢复草稿默认值: "Restore draft defaults",
  "非官方 Web 实现": "Unofficial Web implementation",
  "专为 Xlite v4 Mini 适配": "Adapted for Xlite v4 Mini",
  更改尚未应用: "Unapplied changes",
  请重新读取设备: "Read the device again",
  设置已保存在此浏览器: "Settings saved in this browser",
  "性能页设置自动保存；按键、电源和导入的其他更改需点击应用。":
    "Performance settings save automatically. Button, power, and other imported changes require Apply.",
  "离线编辑仅存为草稿，连接后不会自动写入。":
    "Offline edits stay as drafts and are not written automatically after connecting.",
  重新读取: "Read again",
  应用到鼠标: "Apply to mouse",
  关闭提示: "Dismiss notification",
  确认: "Confirm",
  "正在停止等待；若浏览器设备选择器仍打开，请取消选择。":
    "Stopping the wait. If the browser device picker is still open, cancel it.",
  关闭帮助: "Close help",
  "开始配置你的 Xlite v4": "Set up your Xlite v4",
  "用 USB 线连接鼠标，或插入无线接收器并开启鼠标，确认能无线移动光标。":
    "Connect the mouse by USB, or plug in its wireless receiver and turn on the mouse. Confirm the pointer moves wirelessly.",
  "在桌面 Chrome / Edge 打开本页，点击“连接鼠标”。":
    "Open this page in desktop Chrome / Edge and click “Connect mouse”.",
  "在浏览器选择器中选择 Xlite v4；使用 1K 接收器时选择“1K Dongle”，8K 接收器选择“8K Dongle”，允许访问。":
    "Select Xlite v4 in the browser picker. For receivers, choose “1K Dongle” or “8K Dongle”, then allow access.",
  "1K 或 8K 接收器尚未配对时，先点击顶部“配对接收器”按提示操作。":
    "If your 1K or 8K receiver is not paired, click “Pair receiver” at the top and follow the steps.",
  "性能页设置自动保存；DPI 数值完成输入、颜色选择完成、滑块调节结束后保存。":
    "Performance settings save automatically when DPI editing, color selection, or slider adjustment ends.",
  "按键、电源和导入的其他草稿需点击“应用到鼠标”；宏需点击上传。":
    "Button, power, and other imported drafts require “Apply to mouse”. Macros require Upload.",
  "支持配置切换与宏上传；电源管理页提供实验性 USB 有线固件刷写。暂不支持宏移动轨迹和实时无线信号显示；浏览器无法修改 Windows 系统设置。":
    "Profile switching and macro upload are supported. Power management includes experimental USB wired firmware flashing. Macro movement paths and live wireless signal display are currently unsupported. The browser cannot change Windows system settings.",
  知道了: "Got it",
  界面语言: "Interface language",
  "Pulsar Xlite v4 Mini 浏览器设备配置工具":
    "Browser configuration tool for Pulsar Xlite v4 Mini",
  "第 {0} 档 / 共 {1} 档": "Stage {0} of {1}",
  "{0} 档": "Stages: {0}",
  "{0} 条 · 最近 300 条": "Entries: {0} · latest 300",
  "Xlite v4 Mini · USB 有线": "Xlite v4 Mini · USB wired",
  "已达到 {0} 个事件的本地上限，录制已停止。":
    "The local limit of {0} events has been reached. Recording stopped.",
  "宏 {0}": "Macro {0}",
  "已达到本地事件数量上限。": "The local event limit has been reached.",
  "无法添加事件。": "Unable to add the event.",
  "宏文件超过 2 MB，无法导入。":
    "The macro file exceeds 2 MB and cannot be imported.",
  "导入后超过 128 个本地宏，请先删除部分宏。":
    "Importing would exceed 128 local macros. Delete some macros first.",
  "已导入 {0} 个本地宏。": "Imported {0} local macros.",
  "导入失败。": "Import failed.",
  "已导出本地宏。": "Local macros exported.",
  "导出失败。": "Export failed.",
  本地编辑: "Local editing",
  "录制、编辑与导出按键序列。上传为设备宏后，可在自定义页面绑定鼠标按键。":
    "Record, edit, and export input sequences. Upload a device macro, then assign it to a mouse button on the Customize page.",
  导出全部: "Export all",
  "已导出原版 Fusion CSV 宏。": "Original Fusion CSV macro exported.",
  "原版 CSV": "Fusion CSV",
  本地宏: "Local macros",
  新建宏: "New macro",
  "{0} 个事件": "{0} events",
  刷新设备宏: "Refresh device macros",
  "连接鼠标后读取设备中的宏。": "Connect the mouse to read its macros.",
  "正在同步设备宏…": "Syncing device macros…",
  "暂无已读取的设备宏。点击刷新，或上传本地宏。":
    "No device macros have been read. Refresh the list or upload a local macro.",
  "导入设备宏 {0}": "Import device macro {0}",
  导入到本地编辑: "Import for local editing",
  "删除设备宏 {0}": "Delete device macro {0}",
  删除设备宏: "Delete device macro",
  宏名称: "Macro name",
  未命名宏: "Untitled macro",
  删除当前宏: "Delete current macro",
  "设备宏名称最多 25 字符；转换为设备宏后最多 1000 个事件。":
    "Device macro names support up to 25 characters. After conversion to a device macro, the limit is 1,000 events.",
  上传为新设备宏: "Upload as new device macro",
  循环方式: "Loop mode",
  指定次数: "Repeat count",
  再次按键停止: "Press again to stop",
  重复次数: "Repeat count",
  记录按键间隔: "Record input delays",
  宏录制区域: "Macro recording area",
  "正在录制 · 在此区域按键或点击鼠标，离开区域即停止":
    "Recording · Use the keyboard or mouse here. Leaving this area stops recording.",
  "点击「开始录制」，在此区域输入按键":
    "Click “Start recording”, then enter inputs here",
  停止录制: "Stop recording",
  开始录制: "Start recording",
  "{0} 个事件 · {1} 秒": "{0} events · {1} s",
  清空事件: "Clear events",
  清除延迟: "Remove delays",
  宏事件列表: "Macro event list",
  暂无事件: "No events yet",
  "开始录制，或在下方手动添加": "Start recording or add events manually below",
  等待: "Wait",
  "事件 {0} 延迟毫秒": "Event {0} delay in milliseconds",
  "上移事件 {0}": "Move event {0} up",
  "下移事件 {0}": "Move event {0} down",
  "删除事件 {0}": "Delete event {0}",
  添加事件类型: "Event type to add",
  键盘按键: "Keyboard key",
  鼠标按键: "Mouse button",
  滚轮: "Scroll wheel",
  延迟: "Delay",
  键盘键码: "Keyboard key code",
  中键: "Middle button",
  后退键: "Back button",
  前进键: "Forward button",
  滚轮方向: "Scroll direction",
  向上: "Up",
  向下: "Down",
  添加延迟毫秒: "Delay to add in milliseconds",
  按键动作: "Button action",
  按下: "Press",
  松开: "Release",
  添加事件: "Add event",
  "录制仅接收此页面的键盘和鼠标事件。设备宏的循环方式在按键绑定时设置，指定次数为 1–255 次。上传会创建新设备宏；本地修改不会自动覆盖设备。":
    "Recording captures keyboard and mouse events only within this page. Set device macro loop modes when assigning a button; repeat counts range from 1 to 255. Uploading creates a new device macro. Local edits do not automatically overwrite the device.",
  创建你的第一个宏: "Create your first macro",
  "把一组按键与延迟整理成可重复使用的序列。":
    "Turn inputs and delays into a reusable sequence.",
  取消配对: "Cancel pairing",
  关闭配对窗口: "Close pairing dialog",
  "将 Xlite v4 与原版 Pulsar 1K 或 8K 接收器建立无线连接。无需先在网页连接鼠标。":
    "Pair an Xlite v4 with an original Pulsar 1K or 8K receiver. Connecting the mouse to this page first is unnecessary.",
  只连接目标接收器: "Connect only the target receiver",
  "插入要配对的 Pulsar 1K 或 8K 接收器，拔下其他无线接收器。断开鼠标 USB 数据线，开启鼠标无线模式并放在接收器附近。":
    "Plug in the Pulsar 1K or 8K receiver you want to pair and unplug other wireless receivers. Disconnect the mouse’s USB cable, turn on wireless mode, and place it near the receiver.",
  让鼠标进入配对模式: "Put the mouse in pairing mode",
  同时按住: "Hold together",
  "3–5 秒，直到鼠标 LED 开始闪烁。":
    "for 3–5 seconds until the mouse LED starts flashing.",
  选择接收器并授权: "Select and authorize the receiver",
  "点击下方按钮，在浏览器设备列表中选择 1K Dongle 或 8K Dongle 并允许访问。 配对期间保持鼠标靠近接收器，等待结果。":
    "Click the button below, choose 1K Dongle or 8K Dongle in the browser’s device list, and allow access. Keep the mouse near the receiver while pairing and wait for the result.",
  "当前浏览器不支持 WebHID，请使用桌面版 Chrome 或 Edge。":
    "This browser does not support WebHID. Use desktop Chrome or Edge.",
  "正在准备配对…": "Preparing to pair…",
  关闭: "Close",
  "配对进行中…": "Pairing…",
  选择接收器并开始配对: "Select receiver and start pairing",
  选择鼠标并进入升级模式: "Select mouse and enter update mode",
  选择引导设备并刷写: "Select bootloader device and flash",
  重新连接鼠标并验证: "Reconnect mouse and verify",
  已验证完成: "Verification complete",
  "正在进入升级模式…": "Entering update mode…",
  "正在刷写…": "Flashing…",
  "正在验证版本…": "Verifying version…",
  "第 1 步：校验文件后选择有线连接的 Xlite v4 Mini，让鼠标进入升级模式。随后设备会重新出现在浏览器列表中。":
    "Step 1: After file validation, select the USB-connected Xlite v4 Mini to enter update mode. The device will then reappear in the browser’s device list.",
  "第 2 步：点击下方按钮重新授权引导设备。它可能显示为通用 HID 名称，不含 Pulsar 字样；请确保只连接这一只目标鼠标。":
    "Step 2: Click below to authorize the bootloader device again. It may use a generic HID name without Pulsar; make sure only the target mouse is connected.",
  "第 3 步：等待鼠标重启，再点击下方按钮选择有线连接的 Xlite v4 Mini。读取到版本 {0} 后才会确认刷写成功。":
    "Step 3: Wait for the mouse to restart, then click below and select the USB-connected Xlite v4 Mini. Flashing is confirmed successful only after version {0} is read back.",
  "三步已完成，设备版本已验证为 {0}。可以关闭窗口继续使用鼠标。":
    "All three steps are complete. Device version {0} has been verified. Close this dialog to continue using the mouse.",
  关闭固件刷写窗口: "Close firmware flashing dialog",
  "仅支持 Xlite v4 Mini 鼠标本体通过 USB 数据线直接连接电脑刷写。 请只保留这一只目标鼠标，拔下其他 Pulsar 鼠标和接收器。":
    "Flashing supports only the Xlite v4 Mini mouse connected directly to the computer by USB cable. Keep only the target mouse connected and unplug other Pulsar mice and receivers.",
  "刷写期间保持供电和 USB 连接，勿关闭或刷新页面。":
    "Keep power and USB connected while flashing. Do not close or reload this page.",
  刷写步骤: "Flashing steps",
  进入升级模式: "Enter update mode",
  刷写固件: "Flash firmware",
  重连并验证: "Reconnect and verify",
  选择固件文件: "Select firmware file",
  "Pulsar 官方下载 ↗": "Official Pulsar downloads ↗",
  "支持已适配的官方 1.0.1.7 版本 .exe 升级程序或 .bin 固件。 网页提取并校验固件，不运行 .exe。":
    "Accepts the supported official 1.0.1.7 .exe updater or .bin firmware. This page extracts and validates the firmware without running the .exe.",
  "正在校验文件与目标型号…": "Validating file and target model…",
  当前版本: "Current version",
  目标版本: "Target version",
  文件: "File",
  目标型号: "Target model",
  固件大小: "Firmware size",
  "{0} 字节": "{0} bytes",
  "刷写前建议导出配置和宏；本地草稿会保留，设备配置是否保留需刷写后检查。":
    "Export profiles and macros before flashing. Local drafts are preserved; check after flashing whether device settings were retained.",
  "我确认只连接这一只 Xlite v4 Mini 鼠标，已拔下其他 Pulsar 鼠标和接收器， 用 USB 数据线直接连接电脑，并会保持连接和供电直到刷写结束。":
    "I confirm that only this Xlite v4 Mini is connected, other Pulsar mice and receivers are unplugged, the mouse is connected directly by USB cable, and I will maintain the connection and power until flashing finishes.",
  "当前环境不支持 WebHID，请在桌面版 Chrome 或 Edge 中通过 localhost 或 HTTPS 打开。":
    "WebHID is unavailable here. Open this page in desktop Chrome or Edge over localhost or HTTPS.",
  "刷写开始后无法从此窗口取消，请等待设备返回结果。":
    "Flashing cannot be canceled from this dialog once started. Wait for the device result.",
  "设备仍是 Xlite v4？返回第一步": "Still shown as Xlite v4? Return to step 1",
  "设备仍在升级模式？返回刷写": "Still in update mode? Return to flashing",
  "无法校验固件，请通过 HTTPS 或 localhost 打开本页":
    "Cannot verify firmware. Open this page over HTTPS or localhost.",
  "文件大小不匹配。请解压官方 XS1 v1017_v125_T01 升级包，选择其中的 .exe；也可选择已校验的原始鼠标 .bin 固件。":
    "File size mismatch. Extract the official XS1 v1017_v125_T01 update package and select its .exe, or select the verified raw mouse .bin firmware.",
  "SHA-256 不匹配：只接受已核对的官方 XS1 1.0.1.7 升级器或鼠标固件。文件可能损坏或属于其他型号/版本，未发送任何刷写命令。":
    "SHA-256 mismatch: only the verified official XS1 1.0.1.7 updater or mouse firmware is accepted. The file may be damaged or for another model/version. No flashing commands were sent.",
  "内嵌鼠标固件校验失败，未发送任何刷写命令":
    "Embedded mouse firmware verification failed. No flashing commands were sent.",
  "固件尚未通过官方文件校验，请重新选择文件":
    "Firmware has not passed official file verification. Select the file again.",
  "请选择解压后的官方 Pulsar_Updater_v1017_v125_T01.exe，或已校验的鼠标 .bin 固件。当前文件大小不匹配。":
    "Select the extracted official Pulsar_Updater_v1017_v125_T01.exe or the verified mouse .bin firmware. The current file size does not match.",
  固件长度无效: "Invalid firmware length",
  当前固件命令不接受长度参数:
    "This firmware command does not accept a length parameter",
  固件内容为空: "Firmware is empty",
  "固件应答与当前命令不匹配，刷写已停止":
    "The firmware response does not match the current command. Flashing stopped.",
  "设备拒绝固件命令，刷写已停止":
    "The device rejected the firmware command. Flashing stopped.",
  "设备返回的固件校验和不一致，未发送重启命令":
    "The firmware checksum returned by the device does not match. No restart command was sent.",
  "上一次固件通道操作仍未结束，请等待通道释放后重试；必要时重新插拔鼠标":
    "The previous firmware channel operation is still pending. Wait for the channel to be released before retrying; reconnect the mouse if necessary.",
  "鼠标在刷写期间断开，结果未确认。请保持 USB 连接并使用官方升级工具恢复。":
    "The mouse disconnected during flashing; the result is unconfirmed. Keep USB connected and recover using the official updater.",
  "固件操作已停止，已发送的命令无法撤回；请保持 USB 连接并检查恢复状态":
    "The firmware operation stopped. Commands already sent cannot be undone. Keep USB connected and check recovery status.",
  "固件传输超时，已停止发送；请保持 USB 连接并检查恢复状态":
    "Firmware transfer timed out and sending stopped. Keep USB connected and check recovery status.",
  "固件操作已停止，尚未打开刷写通道":
    "The firmware operation stopped before opening the flashing channel",
  "固件通道已断开或操作已停止，已停止发送":
    "The firmware channel disconnected or the operation stopped. Sending stopped.",
  "固件操作已停止，已停止发送":
    "The firmware operation stopped. Sending stopped.",
  "固件应答超时，刷写已停止；请保持 USB 连接并检查恢复状态":
    "The firmware response timed out and flashing stopped. Keep USB connected and check recovery status.",
  "无法确认鼠标刷写通道：请只保留目标有线鼠标，先连接并读取配置，再重新选择同一鼠标。尚未发送刷写命令。":
    "Cannot identify the mouse flashing channel. Connect only the target wired mouse, connect and read its settings, then select the same mouse again. No flashing commands were sent.",
  "未找到唯一的 484D:0003 鼠标引导程序通道，请只保留目标鼠标并重新选择。":
    "No unique 484D:0003 mouse bootloader channel was found. Connect only the target mouse and select it again.",
  "当前 HID 接口不支持固件刷写所需的输入 / 输出报告":
    "This HID interface does not support the input/output reports required for firmware flashing",
  "固件刷写需要桌面版 Chrome / Edge 的 WebHID 支持":
    "Firmware flashing requires WebHID in desktop Chrome or Edge",
  "未选择鼠标，尚未开始本次操作":
    "No mouse selected. This operation has not started.",
  "已有固件操作正在进行，请等待完成":
    "A firmware operation is already in progress. Wait for it to finish.",
  "当前浏览器不支持 WebHID，请使用桌面版 Chrome 或 Edge，并通过 localhost 或 HTTPS 打开。":
    "This browser does not support WebHID. Use desktop Chrome or Edge and open the page over localhost or HTTPS.",
  "未选择设备。请重新连接并选择 Pulsar 鼠标。":
    "No device selected. Connect again and select the Pulsar mouse.",
  "接收器接口报告长度不匹配（{0} 字节）":
    "Receiver interface report length mismatch ({0} bytes)",
  设备返回了未知轮询率: "The device returned an unknown polling rate",
  "接收器尚未确认连接 Xlite v4（返回型号 {0}），已停止连接。请检查鼠标电源和接收器配对。":
    "The receiver has not confirmed an Xlite v4 connection (reported model {0}). Connection stopped. Check mouse power and receiver pairing.",
  "请确认鼠标已开启无线模式并移动鼠标唤醒，关闭其他配置软件或配置网页后重试；仍失败时重新插拔接收器。":
    "Enable wireless mode and move the mouse to wake it. Close other configuration apps or pages and retry. If it still fails, reconnect the receiver.",
  "请关闭占用设备的软件后重试。":
    "Close other software using the device and retry.",
  "无法读取 Pulsar 配置接口。{0}{1}":
    "Cannot read the Pulsar configuration interface. {0}{1}",
  设备已断开连接: "Device disconnected",
  "接收器接口读取超时，已停止探测":
    "Receiver interface read timed out. Probing stopped.",
  "此 HID 通道的上一项操作尚未结束，请重新插拔设备后重试":
    "The previous operation on this HID channel is still pending. Reconnect the device and retry.",
  "打开 HID 通道超时，请重新插拔设备后重试":
    "Opening the HID channel timed out. Reconnect the device and retry.",
  "关闭 HID 通道超时，连接已停用；请重新插拔设备后重试":
    "Closing the HID channel timed out and the connection was disabled. Reconnect the device and retry.",
  "HID 通道尚未完全释放，已停止切换升级模式；请重新插拔鼠标后重试":
    "The HID channel has not been fully released. Switching to update mode stopped. Reconnect the mouse and retry.",
  设备连接已取消: "Device connection canceled",
  "设备连接已经更改，请重试": "The device connection changed. Retry.",
  请先连接鼠标: "Connect the mouse first",
  "HID I/O 超时，连接已关闭；请重新连接设备":
    "HID I/O timed out and the connection was closed. Reconnect the device.",
  "设备响应校验和不匹配，已停止操作":
    "The device response checksum does not match. Operation stopped.",
  "接收器未收到鼠标响应（状态 05）。请确认鼠标已开启无线模式并移动鼠标唤醒后重试。":
    "The receiver received no mouse response (status 05). Enable wireless mode and move the mouse to wake it, then retry.",
  设备不支持或拒绝了此操作:
    "The device does not support or rejected this operation",
  "设备响应超时 ({0}:{1})。{2}未收到匹配的完成响应，请重新读取设备；持续失败时请导出诊断。":
    "Device response timed out ({0}:{1}). {2}No matching completion response was received. Read the device again; export diagnostics if the failure persists.",
  "已重新查询 {0} 次，": "Queried again {0} time(s). ",
  "设备返回了尚未支持的 LOD 编码":
    "The device returned an unsupported LOD code",
  设备返回了未知灯光模式: "The device returned an unknown lighting mode",
  设备返回了重复配置编号: "The device returned duplicate profile numbers",
  设备配置切换回读不一致: "Device profile switch readback does not match",
  "正在查看存储配置；性能和电源参数属于当前激活配置":
    "Viewing a stored profile; performance and power settings belong to the active profile",
  "设备电池 / 电源信息尚不可用":
    "Device battery/power information is not yet available",
  固件版本读取失败: "Failed to read firmware version",
  设备配置列表读取失败: "Failed to read device profile list",
  "设备活动配置在读取期间发生变化，请重新读取":
    "The active device profile changed while reading. Read it again.",
  "活动配置已经变化，请重新读取后再应用":
    "The active profile changed. Read it again before applying settings.",
  "当前连接最高支持 1000 Hz；更高轮询率需要 8K 接收器":
    "This connection supports up to 1000 Hz. Higher polling rates require an 8K receiver.",
  "设置 {0} 的设备回读不一致，请重新读取设备":
    "Device readback for {0} does not match. Read the device again.",
  "活动配置在写入期间发生变化，请重新读取":
    "The active profile changed while writing. Read it again.",
  请先读取目标配置再写入: "Read the target profile before writing",
  "按键引用的宏不存在于当前设备，请先上传对应宏":
    "A macro referenced by a button does not exist on this device. Upload that macro first.",
  "配置写入后的设备回读不一致，请重新读取设备检查实际值":
    "Device readback after writing settings does not match. Read the device again to check actual values.",
  "接收器灯光设置需要 8K 接收器":
    "Receiver lighting settings require an 8K receiver",
  "请先切换到目标设备配置，再应用性能和电源设置":
    "Switch to the target device profile before applying performance and power settings",
  "电源设置期间设备连接已变化，请重新读取设备":
    "The device connection changed while setting power options. Read the device again.",
  "电源设置回读不一致，请重新读取设备":
    "Power settings readback does not match. Read the device again.",
  "暂时无法读取超过 128 个宏的设备。请使用原配置软件整理宏后重试。":
    "Devices with more than 128 macros cannot currently be read. Reduce the number of macros using the original configuration software and retry.",
  "设备宏列表在读取期间发生变化，请重试":
    "The device macro list changed while reading. Retry.",
  设备宏列表包含重复编号: "The device macro list contains duplicate IDs",
  "设备宏列表分页没有返回新条目，请重新读取":
    "The device macro list page returned no new entries. Read it again.",
  "设备宏列表未完整返回，请重新读取":
    "The device macro list was not returned in full. Read it again.",
  "设备宏大小超过 4096 字节": "Device macro size exceeds 4096 bytes",
  设备宏名称长度无效: "Invalid device macro name length",
  "宏名称须为 1–25 个 UTF-16 字符":
    "Macro names must contain 1–25 UTF-16 code units",
  "宏写入回读不一致，请重新读取设备宏":
    "Macro write readback does not match. Read device macros again.",
  宏删除回读不一致: "Macro deletion readback does not match",
  不支持立即应用此设置: "This setting does not support immediate application",
  "请选择要修改的 DPI 轴": "Select the DPI axis to change",
  立即应用的配置与当前编辑配置不一致:
    "The profile for immediate application does not match the profile being edited",
  "请先切换到目标设备配置，再立即应用设置":
    "Switch to the target device profile before applying settings immediately",
  "设备设置已经变化，请重新读取后再应用":
    "Device settings changed. Read them again before applying settings.",
  "空宏不能写入设备，请先添加事件。":
    "An empty macro cannot be written to the device. Add events first.",
  "暂不支持将键码 {0} 写入设备。请移除此按键事件后重试。":
    "Writing key code {0} to the device is currently unsupported. Remove this key event and retry.",
  "转换为设备宏后超过 {0} 个事件。请减少事件或缩短延迟后重试。":
    "After conversion to a device macro, there are more than {0} events. Reduce events or shorten delays and retry.",
  "设备宏数据格式无效或超出容量限制。请使用原配置软件检查此宏。":
    "The device macro data format is invalid or exceeds the capacity limit. Check this macro using the original configuration software.",
  "设备宏数据被截断。": "Device macro data is truncated.",
  "暂不支持设备宏中的键码 0x{0}。请使用原配置软件编辑此宏。":
    "Key code 0x{0} in this device macro is currently unsupported. Edit this macro using the original configuration software.",
  "暂不支持设备宏中的修饰键组合 0x{0}。请使用原配置软件编辑此宏。":
    "Modifier combination 0x{0} in this device macro is currently unsupported. Edit this macro using the original configuration software.",
  "暂不支持设备宏中的鼠标按键组合 0x{0}。请使用原配置软件编辑此宏。":
    "Mouse button combination 0x{0} in this device macro is currently unsupported. Edit this macro using the original configuration software.",
  "暂不支持设备宏中的滚轮步进值 0x{0}。请使用原配置软件编辑此宏。":
    "Wheel step value 0x{0} in this device macro is currently unsupported. Edit this macro using the original configuration software.",
  "暂不支持设备宏中的指令 0x{0}，无法导入。请使用原配置软件编辑此宏。":
    "Instruction 0x{0} in this device macro is currently unsupported, so it cannot be imported. Edit this macro using the original configuration software.",
  "设备宏包含未知指令 0x{0}（偏移 {1}）。":
    "The device macro contains unknown instruction 0x{0} (offset {1}).",
  "设备宏超过 {0} 个事件。请使用原配置软件减少事件后重试。":
    "The device macro exceeds {0} events. Reduce events using the original configuration software and retry.",
  "设备宏 ID 必须在 1–65535 之间。":
    "Device macro IDs must be between 1 and 65535.",
  "宏循环方式无效。": "Invalid macro loop mode.",
  "原生宏的重复次数必须在 1–255 之间。":
    "Native macro repeat counts must be between 1 and 255.",
  "宏绑定中的设备 ID 无效。": "Invalid device ID in macro binding.",
  "宏绑定中的设备 ID 不能为零。":
    "The device ID in a macro binding cannot be zero.",
  "宏绑定中的循环配置无效。": "Invalid loop configuration in macro binding.",
  "宏文件中的数据格式无效。": "Invalid data format in macro file.",
  "{0}必须是 {1}–{2} 之间的整数。":
    "{0} must be an integer between {1} and {2}.",
  "{0}不能为空，且不能超过 {1} 个字符。":
    "{0} must not be empty or exceed {1} characters.",
  "滚轮方向无效。": "Invalid wheel direction.",
  "按键事件必须指定按下或松开。": "Key events must specify press or release.",
  键码: "Key code",
  "键码格式无效，请使用 KeyA、Space 等浏览器键码。":
    "Invalid key code format. Use browser key codes such as KeyA or Space.",
  "宏文件包含不支持的事件类型。":
    "The macro file contains an unsupported event type.",
  "宏列表格式无效，最多支持 {0} 个本地宏。":
    "Invalid macro list format. Up to {0} local macros are supported.",
  "宏 ID": "Macro ID",
  "宏文件包含重复的 ID。": "The macro file contains duplicate IDs.",
  "每个宏最多支持 {0} 个本地事件。":
    "Each macro supports up to {0} local events.",
  "无法读取 JSON，请选择本应用导出的宏文件。":
    "Cannot read JSON. Select a macro file exported by this app.",
  "宏文件格式或版本不受支持。": "Unsupported macro file format or version.",
  "等待 {0} ms": "Wait {0} ms",
  "滚轮 · {0}": "Wheel · {0}",
  导入的宏: "Imported macro",
  "CSV 文件超过 2 MB": "CSV file exceeds 2 MB",
  "不是 Pulsar Fusion 宏 CSV 文件":
    "This is not a Pulsar Fusion macro CSV file",
  "原版宏最多支持 1000 个事件": "Native macros support up to 1000 events",
  "第 {0} 行格式无效": "Invalid format on line {0}",
  "第 {0} 行延迟格式无效": "Invalid delay format on line {0}",
  "第 {0} 行包含不支持的键名：{1}":
    "Line {0} contains an unsupported key name: {1}",
  "第 {0} 行包含不支持的鼠标移动事件。请移除此事件后重新导入。":
    "Line {0} contains an unsupported mouse movement event. Remove this event and import again.",
  "第 {0} 行事件类型 {1} 不受支持":
    "Event type {1} on line {0} is not supported",
  "CSV 中没有宏事件": "No macro events in CSV",
  "原版 CSV 不支持键码 {0}":
    "The native CSV format does not support key code {0}",
  "原版 CSV 不转义逗号键，无法可靠导入原程序；请使用 JSON 导出":
    "The native CSV format does not escape the comma key and cannot be reliably imported into the original app. Export as JSON instead.",
  前进: "Forward",
  后退: "Back",
  向上滚动: "Scroll up",
  向下滚动: "Scroll down",
  "切换 DPI": "Cycle DPI",
  向上循环配置: "Cycle profiles up",
  向下循环配置: "Cycle profiles down",
  双击: "Double click",
  "播放 / 暂停": "Play / pause",
  下一曲: "Next track",
  上一曲: "Previous track",
  静音: "Mute",
  "音量 +": "Volume +",
  "音量 −": "Volume −",
  停止播放: "Stop playback",
  媒体播放器: "Media player",
  计算器: "Calculator",
  我的电脑: "My computer",
  浏览器主页: "Browser home",
  刷新: "Refresh",
  电子邮件: "Email",
  资源管理器: "File explorer",
  "屏幕亮度 +": "Screen brightness +",
  "屏幕亮度 −": "Screen brightness −",
  复制: "Copy",
  剪切: "Cut",
  粘贴: "Paste",
  切换应用: "Switch apps",
  禁用: "Disabled",
  "DPI 锁定 {0}": "DPI lock {0}",
  "宏 {0} · {1}{2}": "Macro {0} · {1}{2}",
  "快捷键 {0} + {1}": "Shortcut {0} + {1}",
  "原始映射 {0}:{1}:{2}": "Raw mapping {0}:{1}:{2}",
  "浏览器返回了多个无法区分的配对通道，尚未发送命令。请只保留目标接收器后重试；若仍失败，请导出诊断。":
    "The browser returned multiple indistinguishable pairing channels. No commands were sent. Connect only the target receiver and retry. If it still fails, export diagnostics.",
  "未找到兼容的配对通道（64 字节输入 / 输出报告 0）。请选择原版 1K Dongle 或 8K Dongle；可导出诊断以核对接口。":
    "No compatible pairing channel was found (64-byte input/output report 0). Select an original 1K Dongle or 8K Dongle; export diagnostics to check the interface.",
  "当前 HID 接口不支持配对所需的输入 / 输出报告":
    "This HID interface does not support the input/output reports required for pairing",
  "配对通道只读检查超时，尚未发送配对命令":
    "The read-only pairing channel check timed out. No pairing commands were sent.",
  "无法确认配对通道：需要同一接收器的两个完整接口。请只保留目标 1K 或 8K 接收器并重新选择；仍失败时请导出诊断。":
    "Cannot identify the pairing channel: both complete interfaces from the same receiver are required. Connect only the target 1K or 8K receiver and select it again. Export diagnostics if it still fails.",
  "正在只读检查接收器的配对和配置通道…":
    "Checking the receiver pairing and configuration channels without writing…",
  "接口只读检查结果不足以确认配对通道，尚未发送配对命令。请重新插拔接收器，或导出诊断以核对接口。":
    "The read-only interface checks could not identify the pairing channel. No pairing commands were sent. Reconnect the receiver or export diagnostics to check the interfaces.",
  "配对需要桌面版 Chrome / Edge 的 WebHID 支持":
    "Pairing requires WebHID in desktop Chrome or Edge",
  "未选择接收器，配对未开始": "No receiver selected. Pairing has not started.",
  "已停止只读检查，尚未发送配对命令":
    "The read-only check stopped. No pairing commands were sent.",
  "已停止等待配对。已发送的配对命令无法撤回；接收器可能继续等待，请重新连接检查状态。":
    "Stopped waiting for pairing. Pairing commands already sent cannot be undone; the receiver may keep waiting. Reconnect to check its status.",
  "配对接口 I/O 超时，请重新插拔接收器后重试":
    "Pairing interface I/O timed out. Reconnect the receiver and retry.",
  "正在打开接收器的配对通道…": "Opening the receiver pairing channel…",
  "接收器报告配对失败。请让鼠标重新进入配对模式后重试。":
    "The receiver reported a pairing failure. Put the mouse into pairing mode again and retry.",
  "接收器已拔出，配对结果未确认":
    "The receiver was unplugged; the pairing result is unconfirmed",
  "30 秒内未确认配对结果。请重新连接检查状态，或让鼠标重新进入配对模式后重试。":
    "Pairing was not confirmed within 30 seconds. Reconnect to check status, or put the mouse into pairing mode again and retry.",
  "正在配对，最多等待 30 秒。请保持鼠标靠近接收器…":
    "Pairing; waiting up to 30 seconds. Keep the mouse near the receiver…",
  "配置 {0}": "Profile {0}",
  "请选择此 Web 版导出的 Xlite v4 配置文件":
    "Select an Xlite v4 profile exported by this web app",
  配置名称无效: "Invalid profile name",
  "{0}必须是 {1}–{2} 之间的整数": "{0} must be an integer between {1} and {2}",
  "参数 {0} 无效": "Invalid {0}",
  协议报文长度不足: "Protocol packet is too short",
  "载荷超过 55 字节的报文上限": "Payload exceeds the 55-byte packet limit",
  "DPI 响应长度无效": "Invalid DPI response length",
  "DPI 档位编号无效": "Invalid DPI stage index",
  "DPI 必须以 10 DPI 为步长": "DPI must use 10 DPI increments",
  "抬升距离必须在 0.7–2.0 mm 之间，步长为 0.1 mm":
    "Lift-off distance must be 0.7–2.0 mm in 0.1 mm increments",
  "LED 灯光效果无效": "Invalid LED effect",
  "RGB 颜色无效": "Invalid RGB color",
  配置必须包含所有物理按键的绑定:
    "Profile must include every physical button binding",
  按键绑定无效: "Invalid button binding",
  未知的物理按键: "Unknown physical button",
  不支持的按键绑定类型: "Unsupported button binding type",
  "宏绑定必须引用有效的宏 ID": "Macro binding must reference a valid macro ID",
  "DPI 锁定值必须以 10 DPI 为步长": "DPI lock must use 10 DPI increments",
  此按键动作不支持第三个参数:
    "This button action does not support a third argument",
  请至少保留一个按键用于左键单击:
    "Keep at least one button assigned to left click",
  不支持的回报率: "Unsupported polling rate",
  报文字节: "Packet byte",
  "DPI 档位数量": "DPI stage count",
  "当前 DPI 档位": "Active DPI stage",
  "DPI X 轴": "DPI X",
  "DPI Y 轴": "DPI Y",
  配置编号: "Profile",
  "RGB 颜色": "RGB color",
  按键绑定: "Button binding",
  "DPI 锁定低字节": "DPI lock low byte",
  "DPI 锁定": "DPI lock",
  电量百分比: "Battery percent",
  低电量阈值: "Low power threshold",
  活动配置: "Active profile",
  配置数量: "Profile count",
  "配置 ID": "Profile ID",
  休眠秒数: "Sleep seconds",
  接收器指示灯: "Receiver indicator",
  宏数据长度: "Macro data length",
  宏字节: "Macro byte",
  "。支持通过 USB 数据线为 Xlite v4 Mini 更新官方 1.0.1.7 固件。":
    ". Update the Xlite v4 Mini to official firmware 1.0.1.7 using a USB cable.",
  实验性固件刷写: "Experimental firmware flashing",
  "重新配对会改变现有无线配对关系。不支持 Gen.2。取消或超时只停止本页等待，请重新连接检查状态。":
    "Re-pairing changes the existing wireless pairing. Gen.2 is unsupported. Canceling or timing out only stops this page’s wait; reconnect to check the actual state.",
};
