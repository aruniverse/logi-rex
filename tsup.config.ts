import { postBuildProcessing } from '@logitech/plugin-toolkit';
import { esmShimPlugin } from '@logitech/plugin-toolkit/esbuild';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';
import { actions, adjustments } from './src/catalog';

export default defineConfig({
  entry: {
    index: 'index.ts', cli: 'src/cli.ts', bridge: 'src/bridge.ts',
    catalog: 'src/catalog.ts', profiles: 'src/profiles.ts', actions: 'src/actions.ts',
  },
  format: ['esm'], outDir: 'dist', outExtension: () => ({ js: '.mjs' }),
  clean: true, bundle: true, platform: 'node', target: 'es2022',
  noExternal: [/.*/], shims: true,
  esbuildPlugins: [esmShimPlugin({ require: true })],
  onSuccess: async () => {
    await postBuildProcessing(fileURLToPath(new URL('.', import.meta.url)));
    await chmod('dist/cli.mjs', 0o755);
    for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(file, `dist/${file}`);
    await copyFile('docs/compatibility.md', 'dist/COMPATIBILITY.md');
    const names = [
      ...actions.map(a => `rex_${a.id.replaceAll('-', '_')}`),
      ...adjustments.map(a => `rex_adjust_${a.id.replaceAll('-', '_')}`),
    ];
    for (const directory of ['actionicons', 'actionsymbols']) {
      await mkdir(`dist/${directory}`, { recursive: true });
      for (const name of names) await copyFile('assets/action.svg', `dist/${directory}/${name}.svg`);
    }
  },
});
