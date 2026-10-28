import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const script = resolve('scripts/release-info.mjs');

test('release info sends prereleases to next and stable versions to latest', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'logi-rex-release-info-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const implicit = join(directory, 'must-not-write');
  for (const [version, prerelease, npmTag] of [
    ['0.1.0', false, 'latest'],
    ['0.1.0-alpha.1', true, 'next'],
    ['1.0.0-beta', true, 'next'],
    ['1.2.3-rc.2', true, 'next'],
    ['1.2.3+build-with-hyphen', false, 'latest'],
  ]) {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version }));
    const result = spawnSync(process.execPath, [script, `v${version}`], {
      cwd: directory, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: implicit },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { version, prerelease, npmTag });
  }
  await assert.rejects(readFile(implicit), { code: 'ENOENT' });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ version: '0.1.0-alpha.1' }));
  const output = join(directory, 'outputs');
  await writeFile(output, 'existing=value\n');
  const github = spawnSync(process.execPath, [script, 'v0.1.0-alpha.1', '--github-output', output], { cwd: directory, encoding: 'utf8' });
  assert.equal(github.status, 0, github.stderr);
  assert.equal(await readFile(output, 'utf8'), 'existing=value\nprerelease=true\nnpm_tag=next\n');
});

test('invalid versions and mismatched tags cannot emit release outputs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'logi-rex-invalid-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'outputs');
  for (const [version, tag] of [
    ['0.1.0-alpha.1', 'v0.1.0'],
    ['0.1.0', 'V0.1.0'],
    ['1.2', 'v1.2'],
    ['01.2.3', 'v01.2.3'],
    ['1.2.3-01', 'v1.2.3-01'],
    ['1.2.3-alpha..1', 'v1.2.3-alpha..1'],
    ['v1.2.3', 'vv1.2.3'],
    [' 1.2.3', 'v 1.2.3'],
    ['1.2.3\nnpm_tag=latest', 'v1.2.3\nnpm_tag=latest'],
    [null, 'vnull'],
  ]) {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version }));
    await writeFile(output, 'untouched=value\n');
    const result = spawnSync(process.execPath, [script, tag, '--github-output', output], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1, JSON.stringify({ version, tag }));
    assert.match(result.stderr, /version|tag|SemVer/i);
    assert.equal(await readFile(output, 'utf8'), 'untouched=value\n');
  }
});

test('publishing uses the classified channel and fails closed if outputs are missing or inconsistent', async t => {
  const workflow = YAML.parse(await readFile('.github/workflows/release.yml', 'utf8'));
  const steps = workflow.jobs.release.steps;
  const channel = steps.find(step => step.id === 'release');
  assert.ok(channel, 'workflow must classify the release before publishing');
  assert.match(channel.run, /release-info\.mjs/);
  assert.match(channel.run, /--github-output/);
  const github = steps.find(step => step.run?.includes('gh release create'));
  const npm = steps.find(step => /^\s*pnpm publish /m.test(step.run || ''));
  assert.equal(github.env.PRERELEASE, '${{ steps.release.outputs.prerelease }}');
  assert.equal(npm.env.PRERELEASE, '${{ steps.release.outputs.prerelease }}');
  assert.equal(npm.env.NPM_TAG, '${{ steps.release.outputs.npm_tag }}');
  const checksums = steps.find(step => step.run?.includes('shasum'));
  assert.ok(!checksums.run.includes('LogiRex.lplug4'), 'unverified Options+ installer must not be a release asset');
  for (const version of ['0.1.0', '0.1.0-alpha.1']) {
    const directory = await mkdtemp(join(tmpdir(), 'logi-rex-publish-fixture-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const bin = join(directory, 'bin');
    await mkdir(bin);
    for (const command of ['gh', 'pnpm']) await writeFile(join(bin, command), '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$ARG_LOG"\n', { mode: 0o755 });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version }));
    for (const name of ['LogiRex.lplug4', `aruniverse-logi-rex-${version}.tgz`, 'SHA256SUMS']) await writeFile(join(directory, name), 'fixture');
    const classified = spawnSync(process.execPath, [script, `v${version}`], { cwd: directory, encoding: 'utf8' });
    assert.equal(classified.status, 0, classified.stderr);
    const info = JSON.parse(classified.stdout);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REF_NAME: `v${version}`, PRERELEASE: String(info.prerelease), NPM_TAG: info.npmTag };
    const ghLog = join(directory, 'github-args');
    const ghResult = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', github.run], { cwd: directory, env: { ...env, ARG_LOG: ghLog }, encoding: 'utf8' });
    assert.equal(ghResult.status, 0, ghResult.stderr);
    const ghArgs = (await readFile(ghLog, 'utf8')).trim().split('\n');
    assert.deepEqual(ghArgs.slice(0, 3), ['release', 'create', `v${version}`]);
    assert.equal(ghArgs.includes('--prerelease'), info.prerelease);
    assert.equal(ghArgs.includes('--latest=false'), info.prerelease);
    assert.equal(ghArgs.includes('--latest'), !info.prerelease);
    assert.ok(ghArgs.includes(`aruniverse-logi-rex-${version}.tgz`));
    assert.ok(ghArgs.includes('SHA256SUMS'));
    assert.ok(!ghArgs.includes('LogiRex.lplug4'));
    const npmLog = join(directory, 'npm-args');
    const npmResult = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', npm.run], { cwd: directory, env: { ...env, ARG_LOG: npmLog }, encoding: 'utf8' });
    assert.equal(npmResult.status, 0, npmResult.stderr);
    const npmArgs = (await readFile(npmLog, 'utf8')).trim().split('\n');
    assert.equal(npmArgs[0], 'publish');
    assert.equal(npmArgs[npmArgs.indexOf('--tag') + 1], info.npmTag);
    const noPublish = join(directory, 'must-not-publish');
    for (const [command, overrides] of [
      [github.run, { PRERELEASE: '' }],
      [npm.run, { PRERELEASE: 'true', NPM_TAG: 'latest' }],
      [npm.run, { PRERELEASE: 'false', NPM_TAG: 'next' }],
      [npm.run, { PRERELEASE: '', NPM_TAG: 'next' }],
    ]) {
      const invalid = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c', command], { cwd: directory, env: { ...env, ...overrides, ARG_LOG: noPublish }, encoding: 'utf8' });
      assert.equal(invalid.status, 1);
      await assert.rejects(readFile(noPublish), { code: 'ENOENT' });
    }
  }
});
