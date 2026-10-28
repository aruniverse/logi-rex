# Optional device smoke reports

Device observations are best-effort community evidence, not a hardware certification program or a mandatory release gate. The required software checks and their current status are recorded in [adapter compatibility](compatibility.md#adapter-verification-status).

logi-rex owns its Rex calls, exported mappings, Lua bindings, and SDK plugin behavior. OpenLogi/Options+ and firmware provide device discovery, HID++ input handling, pairing, Bluetooth/receiver transport, DPI, SmartShift, and haptics. A wrong exported mapping remains our bug; a device symptom alone does not establish which layer failed.

## Observation scope

Automated tests do not establish hardware support, and including a starter mapping does not certify a device. A [three-button local OpenLogi/Rex observation](openlogi-smoke.md) is recorded, with explicit version and coverage limits. We do not maintain a promise to test every device, firmware, connection, and macOS combination.

A useful report records the inputs actually tried, their expected and observed behavior, and the relevant software versions. An evidence link can document a specific successful setup without implying support for every variant. Partial results, failures, and Not tested are valid outcomes.

## Prepare a safe optional check

1. Record the package version/tag, device variant, connection, macOS version, Rex app/server versions, device-manager version, route, and preset. Firmware is useful if available; do not include device identities or serial numbers.
2. Use a disposable Rex session. Do not test closing commands against important programs or sessions; the supplied presets do not need destructive actions enabled.
3. Run only one device manager at a time where possible. Back up configurations before changing them, and explain any unusual setup rather than assuming it is supported.
4. Review the exported control map and merge the paired Lua/TOML fragments if using native profiles. Follow migration notes when enabling gestures. For Options+, distinguish plugin actions from native shortcut assignments.
5. Keep gestures disabled for an initial check. Their optional device-wide mapping changes the control outside Rex, where other apps may handle its chords.

`logi-rex doctor --json` can record app/server versions and missing capabilities without executing actions or starting a server. It does not check physical input or native-keybinding installation. Its output contains client identifiers and private paths: redact these before sharing it.

## Record only what you observed

Use the exported map and, if helpful, the [optional device checklist](devices.md#verification-checklist). There is no requirement to complete every item or own every target device.

- Check the input involved in the report before trying rapid sequences. Describe the expected and actual Rex action.
- If relevant, note whether normal clicks, scrolling, typing, or unassigned controls also fail outside Rex. That helps locate an upstream input problem.
- For foreground issues, distinguish app-scoped bindings from explicitly device-wide gestures.
- Check sleep/reconnect or alternative connections only if relevant and available. Leave other paths Not tested.
- Record manual mapping changes, chord collisions, unexpected repeats, and any recovery steps.

The `panes` preset needs the updated pane-cycle keybindings. Re-merge the exported Lua file when switching presets instead of assuming an older installation has every chord.

## Submit and review evidence

Use the [optional hardware/setup report form](https://github.com/aruniverse/logi-rex/issues/new?template=hardware-report.yml) after the repository is published. Ordinary software bug reports do not require a hardware matrix. Remove serial numbers, device identities, client IDs/labels, account names, private paths, tokens, and terminal contents; the form does not redact automatically.

Maintainers should help localize the failure before redirecting it. Incorrect config/control names, action selection, Rex arguments, or SDK behavior are ours to fix. Once isolated, pairing, discovery, HID/firmware, or transport faults should be reported to OpenLogi/Logitech as appropriate. Do not dismiss a report merely because it involves a physical device.

Real OpenLogi configuration acceptance and real Options+ plugin loading are software-integration checks we own. Community device reports can supplement those checks, but neither an individual report nor a simulated SDK test certifies universal hardware support.
