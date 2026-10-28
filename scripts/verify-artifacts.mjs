import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import YAML from 'yaml';
import { parse as parseToml } from 'smol-toml';

const exec = promisify(execFile);
async function run(file, args, options = {}) {
  try { return (await exec(file, args, { maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', ...options })).stdout; }
  catch (error) { throw new Error(`${file} ${args.join(' ')}: ${error.stderr?.toString().trim() || error.message}`); }
}

function checkEntries(entries, verbose) {
  assert.equal(new Set(entries).size, entries.length, 'Archive contains duplicate entries');
  for (const name of entries) {
    assert.ok(!name.startsWith('/') && !/^[a-z]:/i.test(name) && !/[\x00-\x1f\x7f\\]/.test(name), `Unsafe archive name: ${name}`);
    assert.ok(!name.split('/').some(part => part === '..' || part === '.'), `Unsafe archive path: ${name}`);
  }
  const modes = verbose.split('\n').filter(line => /^[-dlhbcps][rwxstST-]{9}[+@.]?\s/.test(line));
  assert.equal(modes.length, entries.length, 'Cannot verify archive entry types');
  assert.ok(modes.every(line => line.startsWith('-') || line.startsWith('d')), 'Archives must contain regular files/directories, not links or special files');
}

async function builtFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await builtFiles(join(directory, entry.name), name + '/'));
    else { assert.ok(entry.isFile(), `Build output is not a regular file: ${name}`); files.push(name); }
  }
  return files;
}

async function verify() {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const plugin = resolve('LogiRex.lplug4');
  const tarball = resolve(`${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`);
  const zipEntries = (await run('unzip', ['-Z', '-1', plugin])).trim().split('\n');
  checkEntries(zipEntries, await run('unzip', ['-Z', '-l', plugin]));
  await run('unzip', ['-t', plugin]);
  const zipFiles = zipEntries.filter(name => !name.endsWith('/'));
  assert.deepEqual(zipFiles.toSorted(), (await builtFiles('dist')).toSorted(), 'Plugin archive does not match the built files');
  const tarEntries = (await run('tar', ['-tzf', tarball])).trim().split('\n');
  checkEntries(tarEntries, await run('tar', ['-tvzf', tarball]));
  for (const name of tarEntries) {
    assert.ok(name.startsWith('package/'), `Unexpected package prefix: ${name}`);
    const relative = name.slice('package/'.length).replace(/\/$/, '');
    if (!relative) continue;
    assert.ok(!relative.split('/').some(part => ['node_modules', 'test', '.git', '.npmrc', '.env'].includes(part) || part.startsWith('.env.')), `Private/development file in package: ${name}`);
    assert.ok(relative === 'package.json' || pkg.files.some(file => relative === file || relative.startsWith(file + '/')), `Unlisted file in package: ${name}`);
  }
  const fromZip = name => run('unzip', ['-p', plugin, name], { encoding: 'buffer' });
  const fromTar = name => run('tar', ['-xOzf', tarball, `package/${name}`], { encoding: 'buffer' });
  const manifest = YAML.parse((await fromZip('metadata/LoupedeckPackage.yaml')).toString());
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.pluginRuntime, 'nodejs');
  assert.equal(manifest.entryPoint, 'index.mjs');
  const packed = JSON.parse((await fromTar('package.json')).toString());
  assert.equal(packed.name, pkg.name);
  assert.equal(packed.version, pkg.version);
  assert.deepEqual(packed.bin, pkg.bin);
  assert.deepEqual(packed.exports, pkg.exports);
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(Object.keys(packed[field] || {}).length, 0, `${field} are not expected in this bundled package`);
  }
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.equal(packed.scripts?.[hook], undefined, `Unexpected install hook: ${hook}`);
  }
  for (const name of ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', ...pkg.files.filter(file => file.startsWith('docs/')), 'examples/rex-keybindings.lua']) {
    assert.deepEqual(await fromTar(name), await readFile(name), `Package content differs: ${name}`);
  }
  const temporary = await mkdtemp(join(tmpdir(), 'logi-rex-artifacts-'));
  try {
    const payload = join(temporary, 'plugin');
    // Materialize verified bytes as regular files; do not extract archive link metadata.
    for (const name of zipFiles) {
      const bytes = await fromZip(name);
      assert.deepEqual(bytes, await readFile(join('dist', name)), `Plugin content differs: ${name}`);
      assert.deepEqual(await fromTar(`dist/${name}`), bytes, `Package/plugin content differs: ${name}`);
      await mkdir(dirname(join(payload, name)), { recursive: true });
      await writeFile(join(payload, name), bytes, { flag: 'wx' });
    }
    console.log('Archive contents, versions, licenses, and plugin/package parity verified.');
    await run(process.execPath, ['--test', 'test/plugin.test.mjs'], {
      env: { ...process.env, LOGI_REX_TEST_PLUGIN_DIR: payload },
    });
    console.log('Plugin loaded from the .lplug4 payload passed SDK protocol tests.');
    const install = join(temporary, 'install');
    await mkdir(install);
    const manager = process.env.npm_execpath || 'pnpm';
    await run(manager, ['add', tarball, '--ignore-scripts', '--ignore-workspace'], { cwd: install });
    const cli = join(install, 'node_modules/.bin/logi-rex');
    const env = { ...process.env, XDG_CONFIG_HOME: join(temporary, 'config') };
    assert.match(await run(cli, ['--help'], { env }), /Rex action bridge/);
    const catalog = JSON.parse(await run(cli, ['actions', '--json'], { env }));
    assert.ok(catalog.commands.some(action => action.id === 'next-tab'));
    assert.ok(catalog.adjustments.some(action => action.id === 'tabs'));
    const directory = join(temporary, 'setup');
    const exported = JSON.parse(await run(cli, ['export', '--model', 'mx-master-4', '--device', 'unit:artifact-test', '--preset', 'panes', '--gestures', '--out', directory, '--json'], { env }));
    assert.equal(exported.directory, directory);
    const lua = await readFile(join(directory, 'rex-bindings.lua'), 'utf8');
    assert.equal(lua, await readFile('examples/rex-keybindings.lua', 'utf8'));
    const device = parseToml(await readFile(join(directory, 'openlogi.toml'), 'utf8')).devices['unit:artifact-test'];
    assert.equal(device.per_app_bindings['com.superlogical.rex'].Back.CustomShortcut, 'cmd+ctrl+alt+shift+f3');
    assert.match(await readFile(join(directory, 'README.md'), 'utf8'), /Preset: panes/);
    const bindings = [...Object.values(device.per_app_bindings['com.superlogical.rex']), ...Object.values(device.bindings.HapticPanel)];
    for (const binding of bindings) assert.ok(lua.includes(`rex.bind("${binding.CustomShortcut}",`));
    console.log('Clean pnpm install, installed CLI, and paired setup export verified.');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

verify().catch(error => {
  console.error(`[verify-artifacts] ${error.message}`);
  process.exitCode = 1;
});
