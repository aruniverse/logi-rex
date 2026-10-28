import { mkdir, open, unlink, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { actions } from './catalog';
import { openLogiProfile, rexBindings, profileBindings, gestureBindings, type ProfileOptions } from './profiles';

export async function exportSetup(options: ProfileOptions, output: string): Promise<{ directory: string; files: string[] }> {
  if (!output) throw new Error('Provide --out with a new directory for the setup bundle.');
  const controls = profileBindings(options);
  if (options.gestures) for (const [direction, id] of Object.entries(gestureBindings)) controls[`Gesture ${direction}`] = id;
  const controlMap = Object.entries(controls).map(([control, id]) => `| ${control} | ${actions.find(action => action.id === id)?.title || id} |`);
  const contents = {
    'rex-bindings.lua': rexBindings(),
    'openlogi.toml': openLogiProfile(options),
    'README.md': [
      '# logi-rex setup bundle', '',
      `Model: ${options.model}`, `Preset: ${options.preset ?? 'tabs'}`, '',
      'These files are fragments, not replacements for your live configuration.',
      'The TOML contains your device identity; keep this bundle out of public version control.',
      'Back up your Rex and OpenLogi configuration before changing either file.', '',
      '## Control map', '', '| Control | Rex action |', '| --- | --- |', ...controlMap, '',
      'These are starter assignments, not hardware certification. logi-rex owns the mappings and Rex bindings.',
      'Device discovery, physical input, and firmware support are provided by OpenLogi/Options+.',
      'Exporting this bundle does not verify acceptance by the target application version.', '',
      '## Install', '',
      '1. Merge rex-bindings.lua into your Rex init.lua and reload Rex config.',
      '2. Quit OpenLogi, then merge openlogi.toml into the existing device configuration.',
      '3. Follow the MIGRATION comments in openlogi.toml: remove only the named old bindings.',
      '4. Restart OpenLogi, bring Rex to the front, and verify one control before testing the rest.', '',
      'Native profiles use the focused local Rex app, not bridge client/config settings.',
      'Gesture maps, if included, are device-wide; other apps may handle their chords.',
      'No live configuration files were changed by this export.', '',
    ].join('\n'),
  };
  const directory = resolve(output);
  try { await mkdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Output ${directory} already exists. Choose a new directory; existing files were not changed.`);
    throw error;
  }
  const created: string[] = [];
  try {
    for (const [name, content] of Object.entries(contents)) {
      const file = join(directory, name);
      const handle = await open(file, 'wx');
      created.push(file);
      try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
    }
  } catch (error) {
    for (const file of created) await unlink(file).catch(() => undefined);
    // Never recursively remove a directory another process may have added files to.
    await rmdir(directory).catch(() => undefined);
    throw error;
  }
  return { directory, files: Object.keys(contents) };
}
