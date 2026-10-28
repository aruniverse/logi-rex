# Build and publish

The project distributes a Logitech plugin and an npm package from the same versioned source. Publishing is not required for local development.

## Build the artifacts

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run verify:artifacts
shasum -a 256 LogiRex.lplug4 aruniverse-logi-rex-*.tgz > SHA256SUMS
```

Outputs:

- `LogiRex.lplug4`: Logitech's plugin archive, built with `@logitech/plugin-toolkit`.
- `aruniverse-logi-rex-<version>.tgz`: the CLI/library and its documentation.
- `SHA256SUMS`: checksums for both files.

`verify:artifacts` needs `tar` and `unzip` (provided by macOS and hosted macOS/Linux CI runners). It builds the minified plugin, reruns the test suite against that build, and creates the `.tgz`. The verifier rejects unsafe archive paths, links/special files, missing or mismatched content, and unexpected runtime dependencies. It runs SDK protocol tests from the `.lplug4` payload, installs the `.tgz` with pnpm in a temporary directory, and exercises the installed CLI and paired setup export. Temporary files are removed afterward. No live Rex or device configuration is changed.

Both CI and release publishing run this gate; an artifact failure stops publication. This verifies distributables and simulated protocol behavior, not acceptance by real application hosts. Device-level observations are optional; actual software acceptance is needed before claiming a host version is verified.

The npm archive contains built JavaScript, examples, documentation, and license notices. Source files, tests, credentials, personal device identities, and local config are not included. The Logitech SDK and its WebSocket dependency are bundled into the built plugin.

To test the npm archive without modifying your global install:

```sh
mkdir -p /tmp/logi-rex-check
pnpm --dir /tmp/logi-rex-check add "$(pwd)/aruniverse-logi-rex-0.1.0.tgz"
/tmp/logi-rex-check/node_modules/.bin/logi-rex --help
```

The `.lplug4` is not a macOS installer. Opening it requires a compatible Logi Plugin Service. It does not install Node, Rex, OpenLogi, or Options+ and does not change your device bindings.

## Create the GitHub repository

The source assumes the owner and repository are `aruniverse/logi-rex`. Before publishing under another owner, change the npm scope, repository URLs, release artifact glob, and workflow scope together.

Review the files first, then create the remote and initial commit:

```sh
git add .
git commit -m "Add logi-rex bridge and Logitech plugin"
gh repo create aruniverse/logi-rex --public --source=. --remote=origin
git push -u origin main
```

Nothing in the local build creates a remote, pushes code, or publishes a package.

## Release a version

The tag-triggered workflow needs permission to write repository contents and packages. If an existing GitHub Package uses this name, grant this repository Actions access to it first. You do not need an npmjs.org token.

The workflow validates a canonical SemVer package version and requires the exact matching `vVERSION` tag. Channel selection is derived from the version, not a manual workflow toggle:

| Version example | GitHub release | npm dist-tag |
| --- | --- | --- |
| `0.1.0` | Stable, Latest | `latest` |
| `0.1.0-alpha.1`, `0.1.0-beta.1`, `0.1.0-rc.1` | Prerelease, never Latest | `next` |

Missing or inconsistent channel outputs stop publication. The workflow does not bump the version. Start from a clean, committed worktree after creating the repository.

### Experimental release

For an initial alpha, explicitly choose a prerelease version:

```sh
pnpm version 0.1.0-alpha.1
pnpm run verify:artifacts
node scripts/release-info.mjs v0.1.0-alpha.1
git push origin main --follow-tags
```

For subsequent previews, use `pnpm version prerelease --preid=alpha` (or `beta` / `rc`), verify the artifacts, and push the new commit/tag. All of these preview identifiers use `next`.

The metadata command prints the selected channel without publishing or writing workflow outputs. The version hook mirrors the full package version into the plugin manifest. Toolkit packaging is checked, but real Logitech-host acceptance and upgrade ordering for prerelease manifest versions still need validation. A GitHub prerelease label is not a host-compatibility guarantee.

### Stable release

For a deliberate stable first release, the manifest and npm package already use `0.1.0`:

```sh
pnpm run verify:artifacts
git tag v0.1.0
git push origin v0.1.0
```

For later releases, start from a clean worktree:

```sh
pnpm version patch
pnpm run verify:artifacts
git push origin main --follow-tags
```

The `pnpm version` hook updates and stages the Logitech manifest alongside the package version. The release workflow checks that the tag matches `package.json`, tests the project, verifies both built artifacts and an installed CLI, creates a GitHub Release with checksums, and publishes to `npm.pkg.github.com` using `GITHUB_TOKEN`.

After an alpha, use `pnpm version 0.1.0` to prepare its stable version, verify it, and push the new commit/tag. Treat all published versions and tags as immutable.

If registry publication fails after the GitHub Release is created, the verified release files remain downloadable. Fix package permissions and publish that exact `.tgz` manually. Preserve its channel explicitly; an omitted `--tag` could promote an experimental build to `latest`:

```sh
# Recovery example for the exact alpha archive already attached to the prerelease:
pnpm publish ./aruniverse-logi-rex-0.1.0-alpha.1.tgz --tag next --ignore-scripts --no-git-checks
```

Use `--tag latest` only for a stable version. Do not replace release assets or reuse a version for different code.

The workflow has been prepared, not executed. Confirm the repository's Actions/package permissions and inspect the first release logs.

## Install from GitHub Packages

GitHub's npm registry requires authentication even for public packages. Use a personal access token with `read:packages` when prompted by `pnpm login`; do not commit a token or put it in a command example:

```sh
pnpm login --scope=@aruniverse --auth-type=legacy --registry=https://npm.pkg.github.com
pnpm add --global @aruniverse/logi-rex --registry=https://npm.pkg.github.com
```

To opt into prereleases after authenticating, install the preview dist-tag explicitly:

```sh
pnpm add --global @aruniverse/logi-rex@next --registry=https://npm.pkg.github.com
```

Users who do not want a registry login can download the `.tgz` from the GitHub Release and install it directly. Both routes install the same CLI.

## Release claims and integration checks

Our responsibility is the adapter contract, not an exhaustive hardware certification program. Use proportionate software checks:

1. Pass package, CLI, safety, and regression tests, including the artifact gate.
2. Record a real-Rex smoke check for action execution and native bindings on the build being claimed.
3. Check exported configuration is accepted by the targeted OpenLogi schema/parser or application version.
4. Check the plugin loads and registers correctly in the declared Options+ host version.

The [adapter status record](compatibility.md#adapter-verification-status) distinguishes verified checks from targets and simulations. If a real-host check has not been performed, keep that adapter labeled experimental rather than implying verified compatibility.

[Community device observations](hardware-testing.md) are best-effort additional evidence, not a mandatory device/firmware/macOS matrix for every release. OpenLogi/Options+ own physical input and upstream device support; we own incorrect presets, exports, Rex calls, and plugin behavior. Do not market starter mappings as hardware certification.
