# OpenLogi three-button smoke observation

This is a scoped, user-reported manual observation, not hardware certification or a full-preset acceptance test.

## Environment

| Item | Observed value |
| --- | --- |
| Code under test | Pre-alpha development commit `609a630`, package version `0.1.0` |
| macOS | 27.0.1 |
| Rex app | 0.1.0, build 1541 |
| Rex server / CLI | `0.0.1793131181-gdd9a20` |
| OpenLogi | 0.8.18, configuration schema 10 |
| Device / connection | MX Master 3S / Bluetooth Low Energy |
| Input manager | OpenLogi active; Options+ input agent stopped |
| Setup | Three-button subset of the Tabs starter mapping; two labelled Rex tabs with split panes |
| Firmware | Not recorded |

The local config used a separate Lua module, loaded with `require`, and three Rex-only `CustomShortcut` overrides. Rex configuration validation reported three bindings with no diagnostics, and the server keymap showed the intended action names after reload. OpenLogi reported an installed input hook, required permissions, and no HID-open failures.

## Observations

| Check | Result / evidence |
| --- | --- |
| Back button changes the test tab | User confirmed the expected Mouse B → Mouse A transition. |
| Forward button changes the test tab | User confirmed the expected Mouse A → Mouse B transition. |
| Middle click zooms and restores the active pane | User confirmed zoom and restore in the split test tab. |
| Outside-Rex scope check | User reported completion and subsequently reported that the setup seemed to work; no independent state capture. |

These observations were reported in the local setup conversation, not captured by an automated device runner. With two tabs, navigation was a smoke check, not an independent test of every direction/wrap case. No device serial, persistent device key, client ID, account name, or private config contents are retained here.

## Limits

The full generated preset, other native shortcuts, wheel/gestures, other devices, reconnect behavior, Node CLI action dispatch, and real Options+ plugin loading were not part of this manual check. The release artifact itself is checked separately by CI; the manual observation above was made before the alpha version bump.
