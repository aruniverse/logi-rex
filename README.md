# logi-rex

An action bridge for [Rex](https://www.superlogical.com/rex), with a Logi Options+ SDK plugin and OpenLogi configuration exports. Includes starter mappings for MX Master 3S, MX Master 4, and MX Keys on macOS; device support is provided by OpenLogi or Options+.

Use buttons, gestures, keyboard controls, and exposed wheel/dial inputs to switch tabs, focus and split panes, change sessions, resize splits, search, and adjust fonts.

**Status: OpenLogi-focused alpha.** A local three-button native mapping smoke check passed with OpenLogi 0.8.18 and Rex build 1541; see the [scoped observation](docs/openlogi-smoke.md). This is not full-preset or universal hardware verification. Automated checks cover packaging, configuration generation, bridge behavior, and simulated SDK callbacks. The CLI bridge and Logi Options+ host path remain experimental; no unverified Options+ installer is attached to this release.

## What ships

- `aruniverse-logi-rex-<version>.tgz`: the CLI/export package, downloadable from GitHub Releases without a registry login.
- `SHA256SUMS`: checksum for the released archive.
- `@aruniverse/logi-rex@next`: the same prerelease package in GitHub Packages.

The source/package retains experimental SDK code. `LogiRex.lplug4` can be built for development and protocol tests, but it is not a published release asset until real Options+ host acceptance is verified.

There is no macOS `.pkg` installer, background daemon, cloud service, telemetry, or raw HID driver. OpenLogi or Options+ owns the device. CLI/plugin actions use the Rex CLI; OpenLogi profiles send native keyboard shortcuts without starting a process per event.

## Scope and responsibility

logi-rex owns the integration contract, not Logitech hardware certification.

| Boundary | What logi-rex owns |
| --- | --- |
| Rex | Correct action calls, arguments, Lua bindings, targeting, and safety checks for the APIs we claim compatibility with. |
| OpenLogi | Configuration exports that match the targeted schema, correct control-name mappings, and matching Rex shortcuts. |
| Logi Options+ | Plugin packaging, loading/registration against a declared host version, callbacks, and error handling. |

OpenLogi/Options+ and device firmware own device discovery, HID++ input handling, pairing, Bluetooth/receiver transport, DPI, SmartShift, and haptics. A wrong starter mapping is still our bug; an upstream input/firmware failure is not automatically an adapter bug. We help localize failures before redirecting them upstream.

Device reports are best-effort observations, not an exhaustive device/firmware/macOS certification program or a mandatory hardware release gate. We do not claim a host version is verified until its software integration has been checked; unverified adapters stay experimental. See [adapter verification status](docs/compatibility.md#adapter-verification-status).

## Requirements

- macOS and Rex with a working `rex` CLI and client actions.
- Node.js 22 or later for the CLI and source builds.
- pnpm 12.15.0, pinned in `packageManager`. Source builds use TypeScript 7.0.2 (the latest stable release when updated).
- Development only: `tar` and `unzip` for archive tests and artifact verification. Both are provided by macOS and the hosted CI runners.
- **OpenLogi export target:** schema 10 with `CustomShortcut` and `per_app_bindings`, plus the supplied [Rex keybindings](examples/rex-keybindings.lua). Syntax and mapping regressions are tested; the three-button subset was accepted in OpenLogi 0.8.18. Other mappings and versions are not covered by that observation.
- **Logi Options+ SDK target:** Node SDK 0.1.1 and Plugin API 6.3, whose documented macOS runtime was introduced in Options+ 2.2. This is an SDK requirement, not a verified host-version range.
- Use **one device manager at a time**. OpenLogi and Options+ can compete for the same HID controls.

Read the [starter mappings and upstream limitations](docs/devices.md) before assigning controls. A plugin cannot make firmware-reserved controls remappable. [Optional device smoke reports](docs/hardware-testing.md) can add setup evidence without implying hardware certification.

### Rex API compatibility

API discovery is verified with **Rex Beta 0.1.0 (build 1497)** and server/CLI **`0.0.1793047680-g2db882`**. All 64 bundled commands resolved to exposed action names. This does not verify every command's execution, argument compatibility, or physical-device behavior.

No minimum Rex version or supported version range has been established. For another build, run `logi-rex doctor --json` and inspect `ok`, `errors`, and `unavailable`; a successful report confirms CLI/action discovery only, not full compatibility. See [Rex compatibility](docs/compatibility.md), also included as `COMPATIBILITY.md` in the plugin archive.

## Install from a GitHub Release

After a release is published, download its `.tgz` and install the downloaded file:

```sh
pnpm add --global ./aruniverse-logi-rex-0.1.0-alpha.1.tgz
logi-rex --help
logi-rex clients
logi-rex doctor
```

This route does not require GitHub Packages credentials. Use the filename/version of the release you downloaded; an alpha archive includes its prerelease suffix. If you prefer the registry, see [GitHub Packages installation](docs/publishing.md#install-from-github-packages). Prereleases use `@aruniverse/logi-rex@next`, not the default stable channel.

### Build locally

If an older Corepack launcher reports a missing `bin/pnpm.cjs`, bootstrap with `npx --yes pnpm@12.15.0 <command>` or update the launcher. This project does not modify global package-manager tooling.

```sh
git clone https://github.com/aruniverse/logi-rex.git
cd logi-rex
pnpm install --frozen-lockfile
pnpm test
pnpm run verify:artifacts
node dist/cli.mjs doctor
pnpm add --global ./aruniverse-logi-rex-0.1.0-alpha.1.tgz
```

`pnpm run verify:artifacts` builds both archives, tests the minified code and packaged plugin, and verifies a clean install of the CLI. It needs `tar` and `unzip`, provided by macOS and the hosted macOS/Linux CI runners. `pnpm run build:pack` remains available for a build without artifact verification.

## Check your installation

```sh
logi-rex doctor
logi-rex doctor --json
```

The default output shows the detected Rex app/server versions, selected client, missing commands, and remediation. `--json` returns `ok`, `errors`, `warnings`, `serverVersion`, `appVersion`, and the detailed capability results for scripts.

Exit status is **0** when the required CLI checks pass and **1** for configuration, connection, target-selection, missing-command, or required foreground-check failures. Warnings cover disabled protection, Rex not being frontmost, unknown versions, and native keybindings/hardware that have not been checked. The command is read-only: it does not execute Rex actions or autostart a missing Rex server.

## Choose the Rex app

For CLI and Logi Options+ actions, the bridge selects the **sole locally connected Rex app** by default, never a remote Mac. It ignores inherited `REX_SESSION`, `REX_BLOCK`, and `REX_CLIENT` selectors. Actions operate on that app's current UI, not the terminal that launched logi-rex.

If discovery is ambiguous, run `logi-rex clients`. Create `~/.config/logi-rex/config.json` with the exact app label or client ID:

```json
{
  "client": "my-mac",
  "requireForeground": true,
  "allowDestructive": false
}
```

Use a label for a persistent setting; connection IDs can change after restarting Rex. If `XDG_CONFIG_HOME` is set, the config lives at `$XDG_CONFIG_HOME/logi-rex/config.json` instead.

By default, bridge actions are ignored unless Rex is frontmost when input arrives and when it is dispatched. Detection uses macOS `lsappinfo`, not UI scripting. Commands that close panes, tabs, or sessions are blocked until you explicitly set `allowDestructive` to `true`. Closing them can terminate running programs. These bridge settings do not apply to native OpenLogi profiles, which use the focused Rex app on this Mac.

## Connect OpenLogi

1. Install the CLI, run `logi-rex doctor`, and find your device's real identity in OpenLogi's config. It may look like `unit:...` or `receiver:...:slot:1`. Do not copy an example identity unchanged.
2. Export a paired setup bundle into a **new directory**:

   ```sh
   logi-rex export --model mx-master-3s --device 'unit:YOUR_DEVICE' --out ../logi-rex-setup
   # Or: --model mx-master-4 / --model mx-keys; add --gestures for mouse gestures.
   ```

3. Review the generated `README.md`, `rex-bindings.lua`, and `openlogi.toml`. The README lists the selected preset and its control map; the Lua and TOML use the same shortcut definitions. Keep bundles out of public version control because the TOML contains your device identity. Export refuses existing destinations, including symlinks; it never merges into live config files.
4. Back up your configurations. Merge `rex-bindings.lua` into Rex `init.lua` and reload Rex config. Quit OpenLogi and merge `openlogi.toml` into its device config, preserving the existing schema version, settings, and other apps' bindings. Merge individual bindings into existing tables rather than duplicating tables, then restart OpenLogi.
5. Bring Rex to the front and test one control before adding the rest.

Bindings use `CustomShortcut`, not shell commands, so rapid input does not start competing CLI workers. Node is needed to generate the files, not to handle each input. CLI targeting/config flags are rejected by `export` and `openlogi`; native profiles always use the focused local Rex app. Add `--json` to `export` for its output directory and file list.

If you already installed [the Rex keybindings](examples/rex-keybindings.lua), the original single-file export remains available:

```sh
logi-rex openlogi --model mx-master-3s --device 'unit:YOUR_DEVICE' > rex-mouse.toml
```

### Workflow presets

Use `--preset tabs`, `--preset panes`, or `--preset sessions` with `export` or `openlogi`. `tabs` is the default and preserves the original assignments.

| Preset | Mouse back/forward and thumb wheel | MX Keys special-key group |
| --- | --- | --- |
| `tabs` | Previous/next tab | Command palette, zoom, new tab |
| `panes` | Previous/next pane | Previous pane, next pane, split right |
| `sessions` | Previous/next session | Previous session, next session, choose session |

```sh
logi-rex export --model mx-master-4 --device 'unit:YOUR_DEVICE' --preset panes --out ../rex-panes-setup
```

Merge the newly exported Lua when switching presets: pane cycling adds Command+Control+Option+Shift+F3/F4. Existing chords retain their meanings, so different devices can use different presets. Mouse zoom/palette controls remain unchanged, and optional directional gestures focus panes in every preset. See [device mappings](docs/devices.md) for the exact keys.

**Migration from shell-based profiles:** replace the old per-app `RunShellCommand` bindings with the generated native bindings. Remove only the old Command+Control+Option+F1..F12 remaps from OpenLogi's `[keyboard.bindings]`; Rex now handles those chords directly. `--function-keys` is retired and returns this migration guidance instead of generating interception rules. Keep unrelated keyboard bindings.

For optional gestures:

```sh
# Device-wide gesture map: explicitly replaces this control outside Rex, too.
logi-rex openlogi --model mx-master-4 --device 'unit:YOUR_DEVICE' --gestures
```

**When switching an installed default profile to gestures**, remove `HapticPanel` (MX Master 4) or `GestureButton` (MX Master 3S) from that device's `per_app_bindings."com.superlogical.rex"` table before merging. Omitting it from a new fragment does not delete the old value; that value would still override the gesture map. The generated fragment repeats the exact table and key to remove.

OpenLogi's per-app overlay accepts single actions, not per-direction gesture maps. Gestures are therefore device-wide and explicitly opt-in. Outside Rex, they send the reserved chords to the focused app, which may handle them. Omit `--gestures` to preserve this control outside Rex, and do not assign these reserved chords to other apps or global shortcuts.

## Connect Logi Options+

This path is experimental and not part of the OpenLogi alpha's manual acceptance scope. No `.lplug4` installer is attached to the release.

1. For development, build `LogiRex.lplug4` with `pnpm run build:pack`.
2. Open it with Logi Options+/Logi Plugin Service and complete the host's installation prompts.
3. Find **logi-rex** in the host's plugin actions. Commands are grouped under **Rex commands**; adjustments are under **Rex wheels and dials**.
4. Add actions to the Actions Ring or another control assignment supported by your installed host and device. An adjustment requires a control that the host exposes to the SDK as an adjustment; a mouse wheel is not automatically exposed just because the plugin provides one.
5. Bring Rex to the front and verify one action.

For development, `pnpm run link:plugin` links the built plugin into the local Plugin Service. Use `pnpm run unlink:plugin` to remove that development link. Neither command runs during build or tests.

**Direct-button and MX Keys fallback:** if Options+ does not offer third-party plugin actions for a physical control, assign a keyboard shortcut to it. [The supplied Rex bindings](examples/rex-keybindings.lua) map Command+Control+Option+F1..F12 to Rex actions. Merge the bindings into your Rex `init.lua`, reload Rex's config, then assign those same chords in the device's Options+ app profile. Do not combine this path with OpenLogi's function-key interception for the same chords.

## Commands and customization

```sh
logi-rex actions
logi-rex run next-tab
logi-rex run focus-left
logi-rex adjust tabs --delta=-2
logi-rex rex-actions
logi-rex do pane.resize --args '{"direction":"right","amount":10}'
```

`actions` lists the bundled command IDs. `rex-actions` lists everything exposed by your installed Rex client. Rex validates action arguments. You can add custom commands, including your own Rex Lua actions, to the config:

```json
{
  "customActions": [
    {
      "id": "clear-terminal",
      "title": "Clear terminal (Ctrl+L)",
      "action": "pane.send_key",
      "args": { "key": "ctrl+l" }
    }
  ]
}
```

Custom commands appear in both `logi-rex actions` and the plugin after restarting/reloading it. IDs matching `adjust-<bundled adjustment ID>`, such as `adjust-tabs`, are reserved for dial actions and rejected to prevent duplicate SDK names. Set `rexPath` to an absolute executable path if automatic CLI discovery fails. See [the example config](examples/config.json).

CLI/plugin dispatches use argument arrays, not shell commands. Plugin events share a bounded queue; wheel/dial deltas accept at most 16 steps per callback. The SDK receives a failed response when Rex rejects a command, rather than a false success. Native OpenLogi profiles bypass this queue and send keyboard shortcuts directly.

`--background` and `--allow-destructive` are explicit bridge overrides, not native-profile options. Keep custom commands and config files trusted: `pane.send_key` can send input to a running terminal.

## Publish

See [the publishing guide](docs/publishing.md). CI tests macOS and Linux on Node.js 22 and 24, including minified builds, archive validation, packaged-plugin protocol tests, and an isolated CLI install/export smoke test. The version-tag workflow uses the same artifact gate before uploading checksums and archives to a GitHub Release and publishing to GitHub Packages. Stable versions use `latest`; alpha/beta/RC versions use npm's `next` tag and GitHub prereleases that cannot become Latest. Missing or inconsistent channel outputs stop publication. No workflow changes the version or publishes until you push a matching version tag.

## License

MIT. Logitech SDK and WebSocket dependency notices are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the plugin archive. This is an independent project, not endorsed by Logitech or Superlogical.
