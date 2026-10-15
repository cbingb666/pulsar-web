# Native resource feature inventory

Source: the user-provided Pulsar Fusion 1.0.5.4 installer, statically extracted as documented in `extraction.md`. This inventory describes the native UI resources. Device capabilities and packet layouts require separate implementation or hardware evidence.

## Navigation and settings

Native translation sections: `CN`, `EN`, `JP`, `KR`, `FR`, `SP`, `DE`, `RU`; the configured language availability mask is `1,1,1,1,1,1,1,0`. The Xlite V4 resource defaults to English and UI folder `XliteV4`.

Navigation keys: Home, Customize, Performance, Macro, Power, Settings, Select Device, Support. Device state distinguishes wired and wireless mode. Profile actions include selection, rename and reset. Button remapping requires at least one left-click assignment.

| Area | Native features evidenced by resource keys |
| --- | --- |
| DPI | Stage count; DPI switcher; individual colors; LED steady, breath or off; brightness; speed |
| Performance | Polling rate; angle snap; motion sync; ripple control; debounce time; lift-off distance; restore |
| Sleep and power | Auto-off time with infinite option; wireless power-saving timeout; low-power battery threshold |
| Receiver | Connection stability with excellent/good/fair/poor labels; LED connection indication or battery-warning-only mode |
| Profiles | Profile selection, name editing, reset; profile-cycle, next and previous mappings |
| Basic button mapping | Left/right/middle/back/forward; separate right-side buttons for applicable models; disabled; scroll up/down; left double-click |
| DPI mapping | DPI cycle, increase, decrease; polling-rate switch |
| Keyboard mapping | Keyboard key plus optional modifiers |
| Media mapping | Player, play/pause, next, previous, volume up/down, mute, stop |
| Shortcut mapping | Calculator, My PC, home, refresh, Explorer, email, brightness up/down |
| Macro playback | Fixed repeat count; repeat while held; repeat until toggled |
| Macro editing | Create/rename/list/delete; record/stop; keyboard/mouse capture; recorded/default/no delay; key delay and interval; clear delays; insert key or delay; save/import/export |

Copy, cut, paste and switch-app keys exist but their English values are empty. A native usage path must be verified before treating these as supported functions.

## Desktop-specific controls

The native UI also includes launch-at-startup, launch-minimized, and Windows pointer settings (sensitivity, scrolling speed, pointer precision, whole-page scrolling and double-click speed). Browser-only implementations cannot assume access to these operating-system preferences through WebHID. Device settings and local web-app settings must be distinguished explicitly.

## Xlite V4 imagery

All paths below are inside `.local/extracted/fusion/Config/XliteV4/`.

| Asset | Dimensions | Use |
| --- | --- | --- |
| `Device.png` | 309 × 565 | Device view |
| `Device_Performance.png` | 309 × 565 | Performance view, same bytes as device view |
| `Device_Customize.png` | 471 × 565 | Mouse plus existing button leader lines |
| `CompanyName.png` | 128 × 43 | Branding |
| `005_Product Card_default.png`, `005_Product Card_hover.png` | 268 × 427 | Product card states |
| `Home_*`, `Customize_*` | approximately 28 × 28 | Navigation states |
| `Performance_*`, `Macro_*` | 26 × 27 | Navigation states |
| `Wired.png`, `Wireless.png` | 22 × 22, 28 × 21 | Connection state |
| `Receiver.png` | 382 × 712 | Receiver view |
| `No Device.png` | 91 × 91 | Empty device state |

The theme file supplies title background RGB `(0,128,255)`, white title foreground and left-panel RGB `(250,250,252)`. Layout, control dimensions and runtime visibility must come from the .NET application's form definitions, not inferred from the theme alone.

The original resources are retained locally for analysis and comparison; their presence is not a claim of ownership or redistribution permission.
