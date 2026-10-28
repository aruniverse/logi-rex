# Starter mappings and upstream device support

These are configuration templates, not a certified hardware-support list. OpenLogi/Options+ and device firmware provide device discovery, input delivery, and the set of remappable controls. logi-rex owns the correctness of its starter mappings and software adapters; it does not certify every device, firmware, or macOS combination.

See [adapter verification status](compatibility.md#adapter-verification-status) for software compatibility evidence. [Optional device observations](hardware-testing.md) can help confirm a setup or localize a failure, but are not an exhaustive hardware release gate.

## Workflow presets

Native profiles accept `--preset tabs|panes|sessions`. The default `tabs` mapping is unchanged. Back/Forward and thumb-wheel directions navigate the chosen target on both mice. On MX Keys, the special-key assignments are:

| Preset | KeySearch | KeyScreenCapture | KeyCalculator |
| --- | --- | --- | --- |
| `tabs` | Command palette | Zoom pane | New tab |
| `panes` | Previous pane | Next pane | Split right |
| `sessions` | Previous session | Next session | Choose session |

The exported README records the full control map. All presets share stable action-to-chord assignments; merge the updated Lua when changing presets. Optional gestures retain click-to-zoom and directional pane focus in every preset. The tables below describe the default `tabs` preset unless stated otherwise.

## MX Master 3S

| Control | OpenLogi starter mapping | Other mapping choices |
| --- | --- | --- |
| Back / Forward | Previous / next Rex tab | Any command ID or custom action |
| Main-wheel click | Zoom / restore pane | Any command |
| Thumb-wheel directions | Previous / next tab | Pane/session navigation, fonts, or resize commands |
| Gesture/thumb button | Choose session | Optional click plus four-direction gesture map |
| Wheel-mode button (`DpiToggle` in OpenLogi) | Command palette | Keep the device's normal wheel-mode behavior instead if preferred |
| Left/right click and vertical scroll | Left unchanged | Normal OS behavior |

The starter profile uses native `CustomShortcut` bindings and requires [the Rex keybindings](../examples/rex-keybindings.lua). It does not launch a CLI worker per button or wheel event. To assign another action, add a Rex shortcut for it and use that chord in OpenLogi.

The MX Master thumb wheel does not have a physical click. OpenLogi has a `Thumbwheel` logical control, but logi-rex does not invent a physical button for it.

## MX Master 4

Includes the mouse mappings above plus the Haptic Sense Panel (`HapticPanel`). The starter profile assigns it to the command palette. `--gestures` uses that panel as the gesture owner instead, with click to zoom and swipes to focus panes.

Before merging `--gestures` into an installed default profile, remove the old `HapticPanel` entry from the device's Rex per-app table. For the MX Master 3S, remove `GestureButton` instead. Otherwise the old single-action overlay masks the gesture map. Gesture maps are device-wide: outside Rex, other apps may handle their reserved shortcut chords.

Haptic hardware detection, force thresholds, SmartShift, ratchet/free-spin mode, DPI, sensitivity, and any haptic feedback remain the device manager's responsibility. The plugin does not issue haptic feedback commands or change hardware settings.

## MX Keys

The OpenLogi starter fragment maps these known HID++ control names when the device exposes them:

| Control | Action |
| --- | --- |
| `KeySearch` | Command palette |
| `KeyScreenCapture` | Zoom / restore pane |
| `KeyCalculator` | New tab |

Availability varies by MX Keys variant, firmware, connection, Fn mode, and OS. These are upstream control names, not a guarantee that every MX Keys exposes all three. Use the actual controls shown by OpenLogi; an unexposed control cannot be remapped by this package.

[The native Rex bindings](../examples/rex-keybindings.lua) install the following chords inside Rex. They work directly from MX Keys or from Options+ shortcut assignments. No OpenLogi function-key interception is needed. Remove legacy remaps for these chords from `[keyboard.bindings]` when migrating; keep unrelated bindings.

| Command+Control+Option + | Rex action |
| --- | --- |
| F1 | Command palette |
| F2 | New tab |
| F3 / F4 | Previous / next tab |
| F5 / F6 | Focus left / right |
| F7 / F8 | Focus up / down |
| F9 | Zoom / restore pane |
| F10 | Split right |
| F11 / F12 | Previous / next session |
| Shift+F1 | Choose session |
| Shift+F3 / Shift+F4 | Previous / next pane |

Ordinary typing, media keys, Fn Lock, backlight controls, and Easy-Switch keep their existing behavior unless you explicitly change them in the device manager. Firmware-reserved Easy-Switch, power, and pairing controls are not plugin actions. This package is not an arbitrary-key keyboard interceptor.

## Logi Options+ assignment surfaces

The official Actions SDK documents Actions Ring, MX Creative Console, and Loupedeck action-executing surfaces. Actions Ring is available through supported MX devices and host versions. Do not assume the SDK can bind every mouse button, every wheel, or every keyboard key directly.

logi-rex supplies both commands and adjustments. Assign them wherever the host exposes those action types. For direct controls without third-party plugin assignment, use Options+' keyboard-shortcut assignment and native Rex bindings. Gesture recognition and repeated wheel events are owned by Options+, not this plugin.

## Verification checklist

This optional smoke checklist is for observed setups, not hardware certification or a mandatory release matrix. Record the versions and controls you actually tried; untested items can stay unchecked.

- [ ] The host installs the plugin or accepts the OpenLogi fragment, and native Rex keybindings are installed for the OpenLogi route.
- [ ] Every exposed button, special key, wheel direction, and gesture produces the intended action.
- [ ] Native click, typing, media controls, vertical scrolling, and unassigned controls still work.
- [ ] Default actions stop when another app is frontmost.
- [ ] App-specific profiles switch correctly and other apps keep their bindings.
- [ ] Rapid wheel events remain usable without unexpected repeats or long queues.
- [ ] Reconnect, sleep/wake, and Bluetooth/receiver changes recover correctly.
- [ ] A remote Rex app is never selected automatically.
- [ ] Closing commands stay blocked until explicitly enabled.
- [ ] OpenLogi and Options+ are not competing for the device.

Automated tests do not establish physical-device support. Use the [optional report procedure](hardware-testing.md#submit-and-review-evidence) to share scoped observations with redacted diagnostics. Pairing/HID/transport problems belong upstream once isolated; incorrect exported mappings, Rex calls, or plugin behavior remain our responsibility.

## Upstream references

- [OpenLogi configuration](https://openlogi.org/docs/configurations)
- [OpenLogi action vocabulary](https://github.com/AprilNEA/OpenLogi/blob/master/crates/openlogi-core/src/binding/action.rs)
- [Logitech supported SDK devices](https://logitech.github.io/actions-sdk-docs/supported-devices/)
- [Logitech Node.js SDK requirements](https://logitech.github.io/actions-sdk-docs/nodejs/introduction/)
- [Rex keyboard shortcuts](https://www.superlogical.com/rex/docs/customize/keyboard-shortcuts)
