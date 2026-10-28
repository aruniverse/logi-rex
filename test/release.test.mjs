import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import YAML from 'yaml';
import { nativeShortcuts } from '../dist/profiles.mjs';
import { actions } from '../dist/catalog.mjs';

test('native Rex shortcut example stays in sync with the F-key mapping', async () => {
  const lua = await readFile('examples/rex-keybindings.lua', 'utf8');
  const bindings = lua.split('\n').filter(l => l.startsWith('rex.bind('));
  assert.equal(bindings.length, Object.keys(nativeShortcuts).length);
  assert.equal(new Set(Object.values(nativeShortcuts)).size, bindings.length);
  for (const [id, chord] of Object.entries(nativeShortcuts)) {
    const action = actions.find(a => a.id === id);
    const binding = bindings.find(line => line.includes(`"${chord}"`));
    assert.ok(binding, id);
    assert.ok(binding.includes(`"${action.action}"`));
    for (const [key, value] of Object.entries(action.args || {})) assert.ok(binding.includes(`${key} = "${value}"`));
  }
});

test('pnpm scripts, package-manager pin, and lockfile stay consistent', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(pkg.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  for (const script of Object.values(pkg.scripts)) assert.ok(!/\bnpm\s/.test(script));
  await assert.rejects(readFile('package-lock.json'), { code: 'ENOENT' });
  const buildPolicy = YAML.parse(await readFile('pnpm-workspace.yaml', 'utf8'));
  assert.deepEqual(buildPolicy.allowBuilds, { esbuild: true });
  const documents = YAML.parseAllDocuments(await readFile('pnpm-lock.yaml', 'utf8')).map(d => d.toJSON());
  const project = documents.find(d => d.importers?.['.']?.devDependencies);
  assert.equal(project.importers['.'].devDependencies.typescript.specifier, pkg.devDependencies.typescript);
});

test('release and CI YAML have the required triggers and permissions', async () => {
  const ci = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  assert.ok(ci.on.pull_request !== undefined || Object.hasOwn(ci.on, 'pull_request'));
  assert.deepEqual(ci.jobs.test.strategy.matrix.node, [22, 24]);
  assert.equal(ci.permissions.contents, 'read');
  const release = YAML.parse(await readFile('.github/workflows/release.yml', 'utf8'));
  assert.deepEqual(release.on.push.tags, ['v*']);
  assert.equal(release.permissions.contents, 'write');
  assert.equal(release.permissions['id-token'], 'write');
  assert.equal(release.permissions.packages, undefined);
  const steps = release.jobs.release.steps;
  assert.ok(steps.some(s => s.run?.includes('gh release create')));
  assert.ok(steps.some(s => /^\s*pnpm publish /m.test(s.run || '')));
  const verified = steps.findIndex(s => s.run === 'pnpm run verify:artifacts');
  assert.ok(verified >= 0 && verified < steps.findIndex(s => s.run?.includes('gh release create')));
  assert.ok(verified < steps.findIndex(s => /^\s*pnpm publish /m.test(s.run || '')));
  for (const workflow of [ci, release]) {
    const job = Object.values(workflow.jobs)[0];
    const install = job.steps.findIndex(s => s.uses === 'pnpm/action-setup@v4');
    const node = job.steps.findIndex(s => s.uses === 'actions/setup-node@v4');
    assert.ok(install >= 0 && install < node, 'pnpm must be available before setup-node');
    assert.equal(job.steps[node].with.cache, workflow === ci ? 'pnpm' : undefined);
    assert.ok(job.steps.some(s => s.run === 'pnpm install --frozen-lockfile'));
    assert.ok(job.steps.some(s => s.run === 'pnpm run verify:artifacts'), 'packaged artifacts must be verified before publishing');
    assert.ok(!job.steps.some(s => /^npm\s/m.test(s.run || '')));
  }
});

test('npm publishing targets the public registry with OIDC and an optional bootstrap npm token', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.deepEqual(pkg.publishConfig, { registry: 'https://registry.npmjs.org', access: 'public' });
  const workflow = YAML.parse(await readFile('.github/workflows/release.yml', 'utf8'));
  const steps = workflow.jobs.release.steps;
  const node = steps.find(step => step.uses === 'actions/setup-node@v4');
  assert.equal(node.with['registry-url'], 'https://registry.npmjs.org');
  assert.equal(node.with.scope, '@aruniverse');
  const publish = steps.find(step => /^\s*pnpm publish /m.test(step.run || ''));
  assert.equal(publish.env.NODE_AUTH_TOKEN, '${{ secrets.NPM_TOKEN }}');
  assert.doesNotMatch(JSON.stringify({ node, publish }), /GITHUB_TOKEN|npm\.pkg\.github\.com/);
});

test('pnpm version hook updates and stages the plugin manifest without touching global git settings', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'logi-rex-version-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, 'package/metadata'), { recursive: true });
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ version: '0.2.0' }));
  const file = 'package/metadata/LoupedeckPackage.yaml';
  await writeFile(join(cwd, file), 'name: LogiRex\nversion: 0.1.0\n');
  const git = args => spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(git(['init', '-q']).status, 0);
  const result = spawnSync(process.execPath, [resolve('scripts/sync-version.mjs')], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(join(cwd, file), 'utf8'), /version: 0\.2\.0/);
  assert.match(git(['show', `:${file}`]).stdout, /version: 0\.2\.0/);
});
