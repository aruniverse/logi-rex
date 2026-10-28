import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const path = 'package/metadata/LoupedeckPackage.yaml';
const manifest = await readFile(path, 'utf8');
if (!/^version: .+$/m.test(manifest)) throw new Error('Plugin manifest has no version field.');
await writeFile(path, manifest.replace(/^version: .+$/m, `version: ${pkg.version}`));
execFileSync('git', ['add', path]);
