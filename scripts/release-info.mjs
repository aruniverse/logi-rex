import { readFile, appendFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import semver from 'semver';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true, options: { 'github-output': { type: 'string' } },
  });
  if (positionals.length !== 1) throw new Error('Provide exactly one release tag, such as v0.1.0-alpha.1.');
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const parsed = typeof version === 'string' && /^\d/.test(version) && version.trim() === version ? semver.parse(version) : null;
  if (!parsed) throw new Error(`Invalid SemVer package version: ${JSON.stringify(version)}`);
  if (positionals[0] !== `v${version}`) throw new Error(`Tag must match package version v${version}.`);
  const prerelease = parsed.prerelease.length > 0;
  const npmTag = prerelease ? 'next' : 'latest';
  if (values['github-output'] !== undefined) {
    await appendFile(values['github-output'], `prerelease=${prerelease}\nnpm_tag=${npmTag}\n`);
  }
  console.log(JSON.stringify({ version, prerelease, npmTag }));
}

main().catch(error => {
  console.error(`[release-info] ${error.message}`);
  process.exitCode = 1;
});
