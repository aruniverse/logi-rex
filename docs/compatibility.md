# Rex compatibility

## Rex action-discovery baseline

API discovery for logi-rex 0.1.0 was verified with:

| Component | Version |
| --- | --- |
| Rex Beta app | 0.1.0, build 1497 |
| Rex server / CLI | `0.0.1793047680-g2db882` |

All 64 bundled commands resolved to action names exposed by that local Rex app. This verifies action-name discovery, not execution of every command, action-argument compatibility, or physical-device behavior.

These are verified builds, not a minimum-version requirement. No supported version range has been established. Do not interpret this as “build 1497 or later”; older and newer builds may expose different commands or argument schemas.

## Adapter verification status

This is a software-integration status record, not a hardware certification matrix.

| Check | Target or baseline | Current evidence |
| --- | --- | --- |
| Packaging and CLI | Current prerelease build | Automated build, archive, installed-CLI, and export checks pass. |
| Rex action discovery | Rex app/server builds above | All bundled action names were found. |
| Real-Rex native actions | Rex 0.1.0 build 1541 / server `0.0.1793131181-gdd9a20` | User-confirmed three-button smoke; other actions and Node bridge dispatch not manually verified. |
| OpenLogi export acceptance | OpenLogi 0.8.18 / schema 10 | Three-button subset accepted and observed; full presets and other versions not verified. |
| Logi Options+ host loading/registration | Node SDK 0.1.1 / Plugin API 6.3 target | SDK simulation only; real host unverified and installer excluded from release assets. |

logi-rex owns correct dispatch, plugin behavior, and configuration exports for the contracts it targets. OpenLogi/Options+ and firmware own device input, discovery, pairing, transport, and hardware behavior. Model-specific starter mappings are our data to maintain, not evidence that every variant is supported.

The [local smoke record](https://github.com/aruniverse/logi-rex/blob/v0.1.0-alpha.1/docs/openlogi-smoke.md) scopes the partial OpenLogi/Rex observation to the exact setup and three bindings. It was made on the pre-alpha development snapshot, not as certification of the entire release artifact.

Record real software acceptance checks before labeling a host/version verified. Best-effort device reports can add observations; they are not a mandatory exhaustive hardware release gate. Until acceptance is recorded, the corresponding adapter remains experimental.

## API requirements

The CLI bridge and Logi Options+ plugin use the documented Rex CLI rather than a private socket API:

```sh
rex client ls --json
rex -C CLIENT actions --json
rex -C CLIENT do ACTION --args JSON --json
```

The bridge requires client discovery and client-action invocation. Before dispatching, it checks that the selected app exposes the requested action name. Rex validates the supplied action arguments. Action-name discovery cannot detect changes in argument schemas or behavior.

Native OpenLogi profiles instead require `rex-bindings.lua` from a paired `logi-rex export` bundle (or the supplied `examples/rex-keybindings.lua`) to be merged into Rex `init.lua` and reloaded. They use Rex's documented `rex.bind` configuration API and send shortcuts to the focused Rex app on this Mac. They do not use bridge config, client targeting, or a CLI process per input. The older baseline above remains action discovery only; the newer local observation covers only the three native bindings described in the smoke record.

## Check another Rex build

Run:

```sh
logi-rex clients
logi-rex doctor
logi-rex doctor --json
```

The readable report identifies the selected client, detected app/server versions, and remediation. The JSON report includes `ok`, `errors`, `warnings`, and `unavailable`. Exit status is 1 for configuration, connection, target-selection, missing-command, or required foreground-check failures; it is 0 when those checks pass. Version lookup failures and unverified native/hardware integration are warnings, not minimum-version restrictions.

Inspect `ok` and `errors`, not just `unavailable`: an empty action list can also mean discovery could not complete. Do not assign commands listed as unavailable. A successful report verifies CLI/action discovery, not argument behavior, installed native keybindings, or physical controls.

Record the app and server versions when testing a new build:

```sh
rex client ls --json
rex whoami --json
```

Before claiming software compatibility with a build, check real Rex action execution/arguments and safety behavior, acceptance of exported OpenLogi configuration, and actual Options+ plugin loading/registration as applicable. This checks our adapter boundaries; it is not a requirement to certify every physical device or firmware combination.

## Prereleases and optional setup evidence

Stable/prerelease flags control GitHub and npm distribution, not hardware compatibility. The full package version is mirrored into the plugin manifest; real Logitech-host installation and upgrade behavior for prerelease versions have not been verified. Successful toolkit packaging or SDK simulation is not proof of host acceptance.

[Optional device smoke reports](https://github.com/aruniverse/logi-rex/blob/main/docs/hardware-testing.md) can record a specific setup and help distinguish adapter failures from upstream input problems. They do not transfer driver/firmware ownership to logi-rex or establish universal model support. Native presets share action meanings, but switching to `panes` requires the newer pane-cycle Lua bindings.

## Package contents

This note ships as `docs/compatibility.md` in the npm-compatible package and as `COMPATIBILITY.md` inside the `.lplug4` plugin archive. Compatibility documentation is not a runtime version gate.
