import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Tiny ZIP fixtures: a Unix symlink, and a regular file with a parent-directory path.
const unsafe = [
  ['UEsDBBQAAAAAAAAAIQD2Bj69CwAAAAsAAAAJAAAAaW5kZXgubWpzb3V0c2lkZS5tanNQSwECFAMUAAAAAAAAACEA9gY+vQsAAAALAAAACQAAAAAAAAAAAAAA/6EAAAAAaW5kZXgubWpzUEsFBgAAAAABAAEANwAAADIAAAAAAA==', /not links or special files/],
  ['UEsDBBQAAAAAAAAAIQD2Bj69CwAAAAsAAAAOAAAALi4vb3V0c2lkZS5tanNvdXRzaWRlLm1qc1BLAQIUAxQAAAAAAAAAIQD2Bj69CwAAAAsAAAAOAAAAAAAAAAAAAACkgQAAAAAuLi9vdXRzaWRlLm1qc1BLBQYAAAAAAQABADwAAAA3AAAAAAA=', /Unsafe archive path/],
];

test('artifact verification rejects links and path traversal before loading or installing payloads', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'logi-rex-unsafe-archive-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@aruniverse/logi-rex', version: '0.1.0' }));
  for (const [fixture, message] of unsafe) {
    await writeFile(join(directory, 'LogiRex.lplug4'), Buffer.from(fixture, 'base64'));
    const result = spawnSync(process.execPath, [resolve('scripts/verify-artifacts.mjs')], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  }
});
