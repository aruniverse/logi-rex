# Build and publish

The OpenLogi alpha distributes the CLI/export package and its checksum. Experimental Logitech plugin code is retained in the source/package and built by the validation gate, but the unverified `.lplug4` installer is not uploaded as a release asset. Publishing is not required for local development.

## Build the artifacts

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run verify:artifacts
shasum -a 256 aruniverse-logi-rex-*.tgz > SHA256SUMS
```

Outputs:

- `LogiRex.lplug4`: development/test build only, not a release asset until real host acceptance is verified.
- `aruniverse-logi-rex-<version>.tgz`: the CLI/library and its documentation.
- `SHA256SUMS`: checksum for the released `.tgz`.

`verify:artifacts` needs `tar` and `unzip` (provided by macOS and hosted macOS/Linux CI runners). It builds the minified plugin, reruns the test suite against that build, and creates the `.tgz`. The verifier rejects unsafe archive paths, links/special files, missing or mismatched content, and unexpected runtime dependencies. It runs SDK protocol tests from the `.lplug4` payload, installs the `.tgz` with pnpm in a temporary directory, and exercises the installed CLI and paired setup export. Temporary files are removed afterward. No live Rex or device configuration is changed.

Both CI and release publishing run this gate; an artifact failure stops publication. This verifies distributables and simulated protocol behavior, not acceptance by real application hosts. Device-level observations are optional; actual software acceptance is needed before claiming a host version is verified.

The npm archive contains built JavaScript, examples, documentation, and license notices. Source files, tests, credentials, personal device identities, and local config are not included. The Logitech SDK and its WebSocket dependency are bundled into the built plugin.

To test the npm archive without modifying your global install:

```sh
mkdir -p /tmp/logi-rex-check
pnpm --dir /tmp/logi-rex-check add "$(pwd)/aruniverse-logi-rex-0.1.0-alpha.2.tgz"
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

## Configure npm publishing

Starting with `v0.1.0-alpha.2`, release tags target the public npm registry at `https://registry.npmjs.org`, not GitHub Packages. The existing `v0.1.0-alpha.1` was published through GitHub Releases and GitHub Packages; its tag and assets are unchanged.

The workflow has `contents: write` for GitHub Releases and `id-token: write` for npm trusted publishing. It does not need `packages: write`. `GITHUB_TOKEN` authenticates only the GitHub Release step, not npm publication. Releases use a fresh dependency install without restoring the CI dependency cache.

### Confirm account and scope access

Authenticate with npmjs.org and confirm the account:

```sh
pnpm login --registry=https://registry.npmjs.org
pnpm whoami --registry=https://registry.npmjs.org
```

The account must own the npm username or organization scope `@aruniverse` and be allowed to publish public packages. A matching GitHub username does not establish npm ownership. Do not put credentials in this repository or paste tokens into issues, logs, or chat.

### Bootstrap the first npm package

npm trusted publishing is configured in an existing package's settings. If `@aruniverse/logi-rex` does not yet exist on npmjs.org, use a temporary token for the first tagged release:

1. In npm's account settings, create a short-lived granular token with the scope/write permissions needed for the initial publication and permission to bypass 2FA for CI. Do not grant unrelated scopes.
2. Add it privately as the repository Actions secret `NPM_TOKEN`. This command prompts for the value; do not put the value in the command:

   ```sh
   gh secret set NPM_TOKEN --repo aruniverse/logi-rex
   ```

3. Prepare and push a new preview version using the procedure below. Do not reuse `v0.1.0-alpha.1`. The workflow publishes the verified `.tgz` with public access, the classified dist-tag, and provenance.
4. Confirm the new version is visible on npmjs.org before configuring trust.

Do not create a release tag until the initial token or an existing trusted publisher is ready. A successful local test does not establish publishing authorization.

### Configure tokenless releases

In the npm package's **Settings → Trusted Publisher**, select **GitHub Actions** and enter:

| Field | Value |
| --- | --- |
| Organization or user | `aruniverse` |
| Repository | `logi-rex` |
| Workflow filename | `release.yml` |
| Environment name | Leave blank; this workflow does not declare one. |
| Allowed actions | Enable direct `npm publish`; staged-only permission is insufficient. |

Enter the filename only, not `.github/workflows/release.yml`. The package repository URL must continue to identify `https://github.com/aruniverse/logi-rex`.

After saving the trusted publisher, remove the bootstrap secret:

```sh
gh secret delete NPM_TOKEN --repo aruniverse/logi-rex
```

Revoke that temporary token in npm. With no `NPM_TOKEN` secret, the publish step has no token credential and pnpm uses GitHub Actions OIDC. The next new version/tag verifies that path; never republish a version just to test authentication. Once OIDC publication succeeds, restrict token-based publishing in npm's package settings.

See the [npm trusted publishing guide](https://docs.npmjs.com/trusted-publishers/) and [pnpm publishing options](https://pnpm.io/cli/publish). Public packages published from this public repository include provenance. Keep the existing pnpm pin; switching registries does not require changing package managers.

## Release a version

The workflow validates a canonical SemVer package version and requires the exact matching `vVERSION` tag. Channel selection is derived from the version, not a manual workflow toggle:

| Version example | GitHub release | npm dist-tag |
| --- | --- | --- |
| `0.1.0` | Stable, Latest | `latest` |
| `0.1.0-alpha.2`, `0.1.0-beta.1`, `0.1.0-rc.1` | Prerelease, never Latest | `next` |

Missing or inconsistent channel outputs stop publication. The workflow does not bump the version. Start from a clean, committed worktree after configuring npm publishing.

### Experimental release

For the next alpha after `0.1.0-alpha.2`:

```sh
pnpm version 0.1.0-alpha.3
pnpm run verify:artifacts
node scripts/release-info.mjs v0.1.0-alpha.3
git push origin main --follow-tags
```

For later previews, use `pnpm version prerelease --preid=alpha` (or `beta` / `rc` for a deliberate label change), verify the artifacts, and push the new commit/tag. All preview identifiers use `next`.

The metadata command prints the selected channel without publishing or writing workflow outputs. The version hook mirrors the full package version into the plugin manifest. Toolkit packaging is checked, but real Logitech-host acceptance and upgrade ordering for prerelease manifest versions still need validation. A GitHub prerelease label is not a host-compatibility guarantee.

### Stable release

To promote the `0.1.0` preview line to its first stable version:

```sh
pnpm version 0.1.0
pnpm run verify:artifacts
git push origin main --follow-tags
```

For later stable patches, use `pnpm version patch`, verify the artifacts, and push the new commit/tag.

The `pnpm version` hook stages the plugin manifest alongside the package version. The workflow checks the tag, tests the project, verifies built artifacts and an installed CLI, creates a GitHub Release with checksums, and publishes the same `.tgz` publicly to npmjs.org with provenance. Treat all published versions and tags as immutable.

### Recover a failed registry publication

If npm publication fails after the GitHub Release is created, the verified files remain downloadable. Inspect the error, fix the account/token/trusted-publisher configuration, and recover the exact archive from that release. Do not rebuild it, replace its assets, or reuse its version for different code.

Check whether npm already contains the version before retrying. If it does, verify its integrity and dist-tag rather than publishing it again. If it does not, authenticate interactively and publish the exact downloaded archive. For example, for an unpublished alpha archive named `aruniverse-logi-rex-0.1.0-alpha.2.tgz`:

```sh
pnpm publish ./aruniverse-logi-rex-0.1.0-alpha.2.tgz --registry=https://registry.npmjs.org --access=public --tag=next --ignore-scripts --no-git-checks
```

An interactive recovery may require 2FA and does not create GitHub Actions provenance. Use `--tag latest` only for a stable version. Inspect the first release logs and public metadata; local tests do not prove registry authorization, provenance, or public visibility.

## Install from npm

Public npm installation requires no registry login. Previews are explicit:

```sh
pnpm add --global @aruniverse/logi-rex@next --registry=https://registry.npmjs.org
```

Once a stable `latest` version exists:

```sh
pnpm add --global @aruniverse/logi-rex --registry=https://registry.npmjs.org
```

For a one-off command without a global installation:

```sh
pnpm --registry=https://registry.npmjs.org dlx @aruniverse/logi-rex@next doctor
```

If an old `.npmrc` maps `@aruniverse` to GitHub Packages, remove that mapping or change it to `https://registry.npmjs.org` before installing. Do not remove unrelated credentials or registry settings.

The GitHub Release `.tgz` remains a public installation option before and after the npm migration. Both routes install the same CLI; neither modifies live Rex or OpenLogi configuration.

## Release claims and integration checks

Our responsibility is the adapter contract, not an exhaustive hardware certification program. Use proportionate software checks:

1. Pass package, CLI, safety, and regression tests, including the artifact gate.
2. Record a real-Rex smoke check for action execution and native bindings on the build being claimed.
3. Check exported configuration is accepted by the targeted OpenLogi schema/parser or application version.
4. Check the plugin loads and registers correctly in the declared Options+ host version.

The [adapter status record](compatibility.md#adapter-verification-status) distinguishes verified checks from targets and simulations. If a real-host check has not been performed, keep that adapter labeled experimental rather than implying verified compatibility.

[Community device observations](hardware-testing.md) are best-effort additional evidence, not a mandatory device/firmware/macOS matrix for every release. OpenLogi/Options+ own physical input and upstream device support; we own incorrect presets, exports, Rex calls, and plugin behavior. Do not market starter mappings as hardware certification.
