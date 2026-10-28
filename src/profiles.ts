import { actions } from './catalog';

export const models = ['mx-master-3s', 'mx-master-4', 'mx-keys'] as const;
export type Model = typeof models[number];

export const mouseBindings: Record<string, string> = {
  Back: 'previous-tab',
  Forward: 'next-tab',
  MiddleClick: 'zoom-pane',
  DpiToggle: 'command-palette',
  ThumbwheelScrollUp: 'previous-tab',
  ThumbwheelScrollDown: 'next-tab',
  GestureButton: 'switch-session',
};

export const keyboardBindings: Record<string, string> = {
  KeySearch: 'command-palette',
  KeyScreenCapture: 'zoom-pane',
  KeyCalculator: 'new-tab',
};

export const presets = {
  tabs: { previous: 'previous-tab', next: 'next-tab', keyboard: keyboardBindings },
  panes: { previous: 'previous-pane', next: 'next-pane', keyboard: { KeySearch: 'previous-pane', KeyScreenCapture: 'next-pane', KeyCalculator: 'split-right' } },
  sessions: { previous: 'previous-session', next: 'next-session', keyboard: { KeySearch: 'previous-session', KeyScreenCapture: 'next-session', KeyCalculator: 'switch-session' } },
};

export const gestureBindings: Record<string, string> = {
  Click: 'zoom-pane', Left: 'focus-left', Right: 'focus-right', Up: 'focus-up', Down: 'focus-down',
};

export const functionKeyActions = [
  'command-palette', 'new-tab', 'previous-tab', 'next-tab',
  'focus-left', 'focus-right', 'focus-up', 'focus-down',
  'zoom-pane', 'split-right', 'previous-session', 'next-session',
];

export const nativeShortcuts: Record<string, string> = {
  ...Object.fromEntries(functionKeyActions.map((id, i) => [id, `cmd+ctrl+alt+f${i + 1}`])),
  'switch-session': 'cmd+ctrl+alt+shift+f1',
  'previous-pane': 'cmd+ctrl+alt+shift+f3',
  'next-pane': 'cmd+ctrl+alt+shift+f4',
};

export type ProfileOptions = { model: string; device: string; gestures?: boolean; preset?: string };

export function profileBindings(options: ProfileOptions): Record<string, string> {
  if (!models.includes(options.model as Model)) throw new Error(`Unknown model. Choose ${models.join(', ')}.`);
  if (!options.device || /[\x00-\x1f\x7f]/.test(options.device)) throw new Error('Provide the real OpenLogi device identity with --device.');
  const preset = options.preset ?? 'tabs';
  if (!Object.hasOwn(presets, preset)) throw new Error(`Unknown preset. Choose ${Object.keys(presets).join(', ')}.`);
  const selected = presets[preset as keyof typeof presets];
  const bindings: Record<string, string> = options.model === 'mx-keys' ? { ...selected.keyboard } : {
    ...mouseBindings, Back: selected.previous, Forward: selected.next,
    ThumbwheelScrollUp: selected.previous, ThumbwheelScrollDown: selected.next,
  };
  if (options.model === 'mx-master-4') bindings.HapticPanel = 'command-palette';
  if (options.gestures && options.model === 'mx-keys') throw new Error('Mouse gestures do not apply to MX Keys.');
  if (options.gestures) delete bindings[options.model === 'mx-master-4' ? 'HapticPanel' : 'GestureButton'];
  return bindings;
}

function luaString(value: string): string {
  return `"${value.replace(/[\x00-\x1f\x7f"\\]/g, character => {
    if (character === '"') return '\\"';
    if (character === '\\') return '\\\\';
    return `\\${character.charCodeAt(0).toString().padStart(3, '0')}`;
  })}"`;
}

export function rexBindings(): string {
  const lines = [
    '-- Required for native OpenLogi profiles; also usable with Options+ shortcuts.',
    '-- Merge into your existing Rex init.lua and reload Rex config.',
    '-- Assign these same Command+Control+Option+F-key chords in your device\'s Rex profile.',
    '-- Existing Rex bindings for these chords will be replaced; normal F-keys are unchanged.',
  ];
  for (const [id, chord] of Object.entries(nativeShortcuts)) {
    const action = actions.find(a => a.id === id);
    if (!action) throw new Error(`Unknown native Rex action: ${id}`);
    const entries = Object.entries(action.args || {}).map(([key, value]) => {
      let literal: string;
      if (typeof value === 'string') literal = luaString(value);
      else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) literal = String(value);
      else throw new Error(`Native shortcut ${id} needs a primitive argument for ${key}.`);
      return `${/^[a-z_][a-z0-9_]*$/i.test(key) ? key : `[${luaString(key)}]`} = ${literal}`;
    });
    lines.push(`rex.bind(${luaString(chord)}, ${luaString(action.action)}${entries.length ? `, { ${entries.join(', ')} }` : ''})`);
  }
  return lines.join('\n') + '\n';
}

export function openLogiProfile(options: ProfileOptions): string {
  const bindings = profileBindings(options);
  const binding = (id: string) => {
    const shortcut = nativeShortcuts[id];
    if (!shortcut) throw new Error(`No native Rex shortcut for ${id}.`);
    return `{ CustomShortcut = ${JSON.stringify(shortcut)} }`;
  };
  const device = JSON.stringify(options.device);
  const scope = `[devices.${device}.per_app_bindings."com.superlogical.rex"]`;
  const owner = options.model === 'mx-master-4' ? 'HapticPanel' : 'GestureButton';
  const lines = [
    '# Generated by logi-rex. Merge into your existing OpenLogi config; do not replace the file.',
    `# Workflow preset: ${options.preset ?? 'tabs'}. Gestures, if enabled, focus panes in every preset.`,
    '# First merge rex-bindings.lua from a paired export (or examples/rex-keybindings.lua) into Rex init.lua and reload Rex config.',
    '# Native shortcuts target the focused local Rex app; bridge config and targeting flags do not apply.',
    '# Back up your config first. Keep its existing schema_version and device settings.',
    '# Left/right click, normal typing, and vertical scrolling are not changed.',
    '# MIGRATION: Remove old cmd+ctrl+alt+f1..f12 remaps from [keyboard.bindings]; Rex handles these chords directly.',
    scope,
    ...Object.entries(bindings).map(([control, id]) => `${control} = ${binding(id)}`),
  ];
  if (options.gestures) {
    lines.push('', `# MIGRATION: Remove ${owner} from ${scope} before merging --gestures.`,
      '# OPT-IN: OpenLogi gesture maps are device-wide, not per-app.',
      '# Outside Rex, other apps may handle these chords. Omit --gestures to preserve this control outside Rex.',
      `[devices.${device}.bindings.${owner}]`,
      ...Object.entries(gestureBindings)
        .map(([direction, id]) => `${direction} = ${binding(id)}`));
  }
  return lines.join('\n') + '\n';
}
