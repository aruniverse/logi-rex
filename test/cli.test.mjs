import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import YAML from 'yaml';
import { actions } from '../dist/catalog.mjs';
import { parse as parseToml } from 'smol-toml';

const cli = resolve('dist/cli.mjs');
const shellQuote = word => `'${word.replaceAll("'", "'\\''")}'`;

async function fixture(t, {
  available = [...actions.map(a => ({ name: a.action })), { name: 'pane.send_key' }],
  clients = [{ client_id: 'client:fixture', info: { kind: 'app', label: 'fixture-mac', version: '0.1.0 (1234)' }, principal: { transport: 'unix' }, connection_state: 'connected' }],
  serverVersion = '0.0.fixture',
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'logi-rex-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const script = join(dir, 'fake.mjs');
  const binary = join(dir, 'fake rex');
  const log = join(dir, 'calls.jsonl');
  await writeFile(script, `
import { appendFileSync } from 'node:fs';
const raw = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(raw) + '\\n');
const args = raw.filter(arg => arg !== '--autostart=false');
if (args.includes('actions')) console.log(JSON.stringify({ actions: ${JSON.stringify(available)} }));
else if (args[0] === 'client') console.log(JSON.stringify({ clients: ${JSON.stringify(clients)} }));
else if (args[0] === 'whoami') console.log(JSON.stringify({ rex_version: ${JSON.stringify(serverVersion)} }));
else console.log('null');
`);
  await writeFile(binary, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(script)} "$@"\n`, { mode: 0o755 });
  const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { dir, binary, log, run };
}

test('CLI help and catalog work without Rex or a settings file', async t => {
  const { run } = await fixture(t);
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Rex action bridge/);
  const catalog = run(['actions', '--json']);
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.ok(JSON.parse(catalog.stdout).commands.some(a => a.id === 'next-tab'));
});

test('doctor reports versions and read-only health, and fails for missing commands', async t => {
  const healthy = await fixture(t);
  const result = healthy.run(['doctor', '--rex', healthy.binary, '--background', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.serverVersion, '0.0.fixture');
  assert.equal(report.appVersion, '0.1.0 (1234)');
  assert.equal(report.client, 'client:fixture');
  assert.equal(report.clientLabel, 'fixture-mac');
  assert.deepEqual(report.unavailable, []);
  assert.ok(report.warnings.some(w => /foreground protection.*disabled/i.test(w)));
  assert.ok(report.warnings.some(w => /native.*not checked/i.test(w)));
  const calls = (await readFile(healthy.log, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.ok(calls.every(args => !args.includes('do')));
  assert.ok(calls.every(args => args[0] === '--autostart=false'), 'doctor must not start a missing Rex server');
  const missing = await fixture(t, { available: [{ name: 'client.tab.next' }] });
  const failed = missing.run(['doctor', '--rex', missing.binary, '--background', '--json']);
  assert.equal(failed.status, 1);
  const unhealthy = JSON.parse(failed.stdout);
  assert.equal(unhealthy.ok, false);
  assert.ok(unhealthy.unavailable.includes('zoom-pane'));
  assert.ok(unhealthy.errors.some(e => /update Rex|custom actions/i.test(e)));
  const human = missing.run(['doctor', '--rex', missing.binary, '--background']);
  assert.equal(human.status, 1);
  assert.match(human.stdout, /FAIL/);
  assert.match(human.stdout, /zoom-pane/);
});

test('doctor keeps configuration and connection failures machine-readable', async t => {
  const disconnected = await fixture(t, { clients: [] });
  const noClient = disconnected.run(['doctor', '--rex', disconnected.binary, '--background', '--json']);
  assert.equal(noClient.status, 1);
  assert.equal(JSON.parse(noClient.stdout).ok, false);
  assert.match(JSON.parse(noClient.stdout).errors.join(' '), /logi-rex clients/);
  const invalid = join(disconnected.dir, 'invalid.json');
  await writeFile(invalid, '{invalid');
  const badConfig = disconnected.run(['doctor', '--config', invalid, '--json']);
  assert.equal(badConfig.status, 1);
  assert.match(JSON.parse(badConfig.stdout).errors.join(' '), /Invalid config/);
  const unknownVersion = await fixture(t, { serverVersion: null });
  const version = unknownVersion.run(['doctor', '--rex', unknownVersion.binary, '--client', 'fixture-mac', '--background', '--json']);
  assert.equal(version.status, 0, version.stderr);
  const report = JSON.parse(version.stdout);
  assert.equal(report.serverVersion, null);
  assert.equal(report.appVersion, '0.1.0 (1234)');
  assert.equal(report.client, 'client:fixture');
  assert.ok(report.warnings.some(w => /version lookup failed/i.test(w)));
});

test('export writes a matched setup bundle without modifying existing files or calling Rex', async t => {
  const { dir, log, run } = await fixture(t);
  const directory = join(dir, 'my setup');
  const args = ['export', '--model', 'mx-master-4', '--device', 'unit:paired', '--gestures', '--out', directory, '--json'];
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).directory, directory);
  assert.deepEqual((await readdir(directory)).sort(), ['README.md', 'openlogi.toml', 'rex-bindings.lua']);
  const lua = await readFile(join(directory, 'rex-bindings.lua'), 'utf8');
  assert.equal(lua, await readFile('examples/rex-keybindings.lua', 'utf8'));
  const toml = await readFile(join(directory, 'openlogi.toml'), 'utf8');
  const device = parseToml(toml).devices['unit:paired'];
  const bindings = [...Object.values(device.per_app_bindings['com.superlogical.rex']), ...Object.values(device.bindings.HapticPanel)];
  for (const binding of bindings) assert.ok(lua.includes(`rex.bind("${binding.CustomShortcut}",`));
  assert.match(await readFile(join(directory, 'README.md'), 'utf8'), /back up|backup/i);
  assert.match(toml, /Remove HapticPanel/);
  await assert.rejects(readFile(log), { code: 'ENOENT' });
  const again = run(args);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /exists|new directory/i);
  assert.equal(await readFile(join(directory, 'rex-bindings.lua'), 'utf8'), lua);
  assert.equal(await readFile(join(directory, 'openlogi.toml'), 'utf8'), toml);
});

test('CLI presets produce matching bundles and a readable control map', async t => {
  const { dir, log, run } = await fixture(t);
  for (const [preset, chord, title] of [
    ['tabs', 'cmd+ctrl+alt+f3', 'Previous tab'],
    ['panes', 'cmd+ctrl+alt+shift+f3', 'Previous pane'],
    ['sessions', 'cmd+ctrl+alt+f11', 'Previous session'],
  ]) {
    const directory = join(dir, preset);
    const result = run(['export', '--model', 'mx-master-4', '--device', 'unit:preset', '--preset', preset, '--out', directory, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const toml = await readFile(join(directory, 'openlogi.toml'), 'utf8');
    const lua = await readFile(join(directory, 'rex-bindings.lua'), 'utf8');
    assert.equal(parseToml(toml).devices['unit:preset'].per_app_bindings['com.superlogical.rex'].Back.CustomShortcut, chord);
    assert.ok(lua.includes(`rex.bind("${chord}",`));
    const readme = await readFile(join(directory, 'README.md'), 'utf8');
    assert.ok(readme.includes(`Preset: ${preset}`));
    assert.ok(readme.includes(`| Back | ${title} |`));
  }
  const single = run(['openlogi', '--model', 'mx-keys', '--device', 'unit:keys', '--preset', 'sessions']);
  assert.equal(single.status, 0, single.stderr);
  assert.equal(parseToml(single.stdout).devices['unit:keys'].per_app_bindings['com.superlogical.rex'].KeySearch.CustomShortcut, 'cmd+ctrl+alt+f11');
  const invalidDirectory = join(dir, 'invalid-preset');
  const invalid = run(['export', '--model', 'mx-keys', '--device', 'unit:keys', '--preset', '__proto__', '--out', invalidDirectory]);
  assert.equal(invalid.status, 1);
  await assert.rejects(stat(invalidDirectory), { code: 'ENOENT' });
  const wrongCommand = run(['actions', '--preset', 'panes']);
  assert.equal(wrongCommand.status, 1);
  assert.match(wrongCommand.stderr, /preset.*openlogi.*export/i);
  await assert.rejects(readFile(log), { code: 'ENOENT' });
});

test('export refuses symlink destinations without changing their targets', async t => {
  const { dir, run } = await fixture(t);
  const target = join(dir, 'live-config');
  const output = join(dir, 'setup-link');
  await mkdir(target);
  await writeFile(join(target, 'init.lua'), '-- keep this configuration\n');
  await symlink(target, output, 'dir');
  const result = run(['export', '--model', 'mx-keys', '--device', 'unit:test', '--out', output]);
  assert.equal(result.status, 1);
  assert.equal(await readFile(join(target, 'init.lua'), 'utf8'), '-- keep this configuration\n');
  assert.deepEqual(await readdir(target), ['init.lua']);
});

test('export validates the model and requires a new output directory', async t => {
  const { dir, run } = await fixture(t);
  const directory = join(dir, 'not-created');
  const invalid = run(['export', '--model', 'other', '--device', 'unit:test', '--out', directory]);
  assert.equal(invalid.status, 1);
  await assert.rejects(stat(directory), { code: 'ENOENT' });
  const missing = run(['export', '--model', 'mx-keys', '--device', 'unit:test']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--out/);
  const targeted = run(['export', '--model', 'mx-keys', '--device', 'unit:test', '--out', directory, '--client', 'remote']);
  assert.equal(targeted.status, 1);
  assert.match(targeted.stderr, /bridge flags do not apply/);
});

test('CLI dispatches to an executable path with spaces and exact arguments', async t => {
  const { binary, log, run } = await fixture(t);
  const result = run(['run', 'next-tab', '--rex', binary, '--client', 'test-mac', '--background', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { sent: true });
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(calls.at(-1), ['-C', 'test-mac', 'do', 'client.tab.next', '--args', '{}', '--json']);
});

test('direct CLI actions preserve JSON instead of treating it as shell code', async t => {
  const { binary, log, run } = await fixture(t);
  const args = { key: 'ctrl+l', note: "$(exit 93); 'quote'" };
  const result = run(['do', 'pane.send_key', '--args', JSON.stringify(args), '--rex', binary, '--client', 'test', '--background']);
  assert.equal(result.status, 0, result.stderr);
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(JSON.parse(calls.at(-1)[5]), args);
});

test('CLI errors are nonzero and do not silently ignore malformed input', async t => {
  const { dir, run } = await fixture(t);
  const bad = join(dir, 'bad.json');
  await writeFile(bad, '{not json');
  for (const args of [
    ['unknown'], ['run'], ['run', 'next-tab', 'extra'], ['--unknown'],
    ['actions', '--config', join(dir, 'missing.json')], ['actions', '--config', bad],
    ['adjust', 'tabs'], ['adjust', 'tabs', '--delta=NaN'],
    ['openlogi', '--model', 'mx-master-4'],
    ['do', 'pane.zoom', '--args', '[]'],
    ['run', 'close-pane'],
  ]) {
    const result = run(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, /\[logi-rex\]/);
  }
});

test('OpenLogi CLI emits native shortcuts and rejects inapplicable bridge flags', async t => {
  const { binary, run } = await fixture(t);
  const base = ['openlogi', '--model', 'mx-master-4', '--device', 'unit:test'];
  const result = run(base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CustomShortcut/);
  assert.match(result.stdout, /rex-keybindings\.lua/);
  assert.ok(!result.stdout.includes(process.execPath));
  assert.ok(!result.stdout.includes(cli));
  assert.ok(result.stdout.includes('HapticPanel'));
  for (const flags of [['--client', 'my-mac'], ['--rex', binary], ['--config', '/missing/config.json'], ['--background'], ['--allow-destructive']]) {
    const invalid = run([...base, ...flags]);
    assert.notEqual(invalid.status, 0, flags.join(' '));
    assert.match(invalid.stderr, /bridge flags do not apply/);
  }
  const legacy = run([...base, '--function-keys']);
  assert.notEqual(legacy.status, 0);
  assert.match(legacy.stderr, /remove.*keyboard\.bindings/i);
});

test('Rex compatibility documentation is included in both package formats', async () => {
  const note = await readFile('docs/compatibility.md', 'utf8');
  const readme = await readFile('README.md', 'utf8');
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(note, /0\.1\.0, build 1497/);
  assert.match(note, /0\.0\.1793047680-g2db882/);
  assert.match(note, /not a minimum-version requirement/);
  assert.match(readme, /\]\(docs\/compatibility\.md\)/);
  assert.ok(pkg.files.includes('docs'));
  assert.equal(await readFile('dist/COMPATIBILITY.md', 'utf8'), note);
});

test('manifest, npm package, executable, and icon versions are ready to distribute', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = YAML.parse(await readFile('package/metadata/LoupedeckPackage.yaml', 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.pluginRuntime, 'nodejs');
  assert.equal(manifest.entryPoint, 'index.mjs');
  assert.equal(pkg.name, '@aruniverse/logi-rex');
  assert.equal(pkg.publishConfig.registry, 'https://npm.pkg.github.com');
  assert.ok((await stat('dist/cli.mjs')).mode & 0o111);
  assert.ok((await stat('dist/metadata/Icon256x256.png')).size > 100);
  assert.ok((await stat('dist/actionicons/rex_next_tab.svg')).size > 100);
  await stat('dist/index.mjs');
});
