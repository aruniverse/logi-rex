#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { adjustments } from './catalog';
import { RexBridge } from './bridge';
import { configPath, loadConfig, validateConfig, type Config } from './config';
import { doctor, formatDoctor } from './doctor';
import { exportSetup } from './export';
import { models, presets, openLogiProfile } from './profiles';

const help = `logi-rex — Rex action bridge and starter-mapping exporter (macOS)

Usage:
  logi-rex actions [--json]              List built-in and custom commands
  logi-rex rex-actions                  List actions exposed by your Rex app
  logi-rex clients                      List connected Rex apps
  logi-rex doctor [--json]              Check versions/capabilities; exit 1 on failure
  logi-rex run <id>                     Execute a named command
  logi-rex do <rex.action> [--args JSON] Execute any Rex client action
  logi-rex adjust <id> --delta=<n>       Execute -16..16 wheel/dial steps
  logi-rex openlogi --model <model> --device <identity> [--preset <name>] [--gestures]
  logi-rex export --model <model> --device <identity> --out <new-directory> [--preset <name>] [--gestures]

Mapping templates: ${models.join(', ')}
Presets: ${Object.keys(presets).join(', ')} (default: tabs)
Adjustments: ${adjustments.map(a => a.id).join(', ')}

Options:
  --config <path>        Read a specific JSON config (default: ${configPath()})
  --rex <absolute-path>  Override the Rex executable
  --client <id-or-label> Target a specific Rex app; otherwise select the sole local app
  --background          Allow actions when Rex is not frontmost (explicit opt-in)
  --allow-destructive   Allow commands that close tabs, panes, or sessions
  --out <directory>     Create a new paired setup directory (export only)
  --preset <name>       Native workflow preset (openlogi/export only)
  --json                Print machine-readable results
  --help                Show this help

openlogi prints native-shortcut bindings; first install examples/rex-keybindings.lua in Rex.
It never edits your device settings. Bridge flags apply to CLI/plugin actions, not native profiles.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' }, rex: { type: 'string' }, client: { type: 'string' },
      background: { type: 'boolean' }, 'allow-destructive': { type: 'boolean' },
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      args: { type: 'string' }, delta: { type: 'string' },
      model: { type: 'string' }, device: { type: 'string' }, preset: { type: 'string' },
      gestures: { type: 'boolean' }, 'function-keys': { type: 'boolean' }, out: { type: 'string' },
    },
  });
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command, id] = positionals;
  const withId = new Set(['run', 'do', 'adjust']);
  if (positionals.length !== (withId.has(command!) ? 2 : 1)) throw new Error('Invalid arguments. Run logi-rex --help.');
  if (values.preset !== undefined && command !== 'openlogi' && command !== 'export') throw new Error('--preset applies to openlogi and export only.');
  if (command === 'openlogi' || command === 'export') {
    if (values['function-keys']) throw new Error('--function-keys is no longer needed: install the Rex keybindings and remove old chord remaps from [keyboard.bindings].');
    if (values.config !== undefined || values.rex !== undefined || values.client !== undefined || values.background || values['allow-destructive']) {
      throw new Error('Native OpenLogi profiles target the focused local Rex app; bridge flags do not apply. Use CLI/plugin actions for explicit client targeting.');
    }
    const options = { model: values.model || '', device: values.device || '', gestures: values.gestures === true, preset: values.preset ?? 'tabs' };
    if (command === 'export') {
      const bundle = await exportSetup(options, values.out || '');
      console.log(values.json ? JSON.stringify(bundle, null, 2) : `Created setup bundle in ${bundle.directory}. Review README.md before merging; live configuration was not changed.`);
    } else {
      if (values.out !== undefined) throw new Error('--out applies to export, not openlogi.');
      console.log(openLogiProfile(options));
    }
    return;
  }
  const overrides: Config = {};
  if (values.rex !== undefined) overrides.rexPath = values.rex;
  if (values.client !== undefined) overrides.client = values.client;
  if (values.background) overrides.requireForeground = false;
  if (values['allow-destructive']) overrides.allowDestructive = true;
  if (command === 'doctor') {
    const report = await doctor(values.config, overrides);
    console.log(values.json ? JSON.stringify(report, null, 2) : formatDoctor(report));
    process.exitCode = report.ok ? 0 : 1;
    return;
  }
  const config = validateConfig({ ...await loadConfig(values.config, values.config !== undefined), ...overrides });
  const bridge = new RexBridge(config);
  const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
  switch (command) {
    case 'actions':
      if (values.json) output({ commands: bridge.commands, adjustments });
      else console.log(bridge.commands.map(a => `${a.id.padEnd(24)} ${a.title}`).join('\n'));
      break;
    case 'clients':
      output((await bridge.clients()).filter(c => c.info?.kind === 'app'));
      break;
    case 'rex-actions':
      output(await bridge.available());
      break;
    case 'run': {
      const sent = await bridge.run(id!);
      if (values.json) output({ sent });
      break;
    }
    case 'do': {
      const sent = await bridge.perform({ id: 'direct', title: id!, action: id!, args: values.args ? JSON.parse(values.args) as Record<string, unknown> : {} });
      if (values.json) output({ sent });
      break;
    }
    case 'adjust': {
      if (values.delta === undefined || !/^-?\d+$/.test(values.delta)) throw new Error('Provide --delta=<integer>, for example --delta=-1.');
      const sent = await bridge.adjust(id!, Number(values.delta));
      if (values.json) output({ sent });
      break;
    }
    default: throw new Error(`Unknown command: ${command}. Run logi-rex --help.`);
  }
}

main().catch(error => {
  console.error(`[logi-rex] ${(error as Error).message}`);
  process.exitCode = 1;
});
