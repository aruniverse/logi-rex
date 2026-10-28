import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'smol-toml';
import { models, openLogiProfile, functionKeyActions } from '../dist/profiles.mjs';
import { actions } from '../dist/catalog.mjs';

// A legacy command option must never make the new profiles spawn CLI workers.
const options = { device: 'unit:test-device', command: ['/legacy/node', '/legacy/cli.mjs'] };
const shortcuts = Object.fromEntries(functionKeyActions.map((id, i) => [id, `cmd+ctrl+alt+f${i + 1}`]));
shortcuts['switch-session'] = 'cmd+ctrl+alt+shift+f1';
shortcuts['previous-pane'] = 'cmd+ctrl+alt+shift+f3';
shortcuts['next-pane'] = 'cmd+ctrl+alt+shift+f4';
const scope = '[devices."unit:test-device".per_app_bindings."com.superlogical.rex"]';

function device(profile, identity = options.device) {
  return parse(profile).devices[identity];
}

test('all three models emit app-scoped native shortcuts, never shell commands', () => {
  for (const model of models) {
    const profile = openLogiProfile({ ...options, model });
    const parsed = device(profile);
    const bindings = parsed.per_app_bindings['com.superlogical.rex'];
    assert.ok(profile.includes(scope));
    assert.match(profile, /rex-keybindings\.lua/);
    assert.ok(!profile.includes('schema_version ='));
    assert.ok(!parse(profile).keyboard, 'reserved chords must not be intercepted or reinjected by OpenLogi');
    assert.ok(!bindings.LeftClick && !bindings.RightClick && !bindings.ScrollUp);
    for (const binding of Object.values(bindings)) {
      assert.deepEqual(Object.keys(binding), ['CustomShortcut']);
      assert.ok(Object.values(shortcuts).includes(binding.CustomShortcut));
    }
    if (model === 'mx-master-4') assert.ok(bindings.HapticPanel);
    if (model === 'mx-master-3s') assert.ok(!bindings.HapticPanel);
    if (model === 'mx-keys') assert.ok(bindings.KeySearch);
  }
});

test('workflow presets change navigation without changing the existing default', () => {
  const expected = {
    tabs: { previous: 'cmd+ctrl+alt+f3', next: 'cmd+ctrl+alt+f4', keyboard: ['cmd+ctrl+alt+f1', 'cmd+ctrl+alt+f9', 'cmd+ctrl+alt+f2'] },
    panes: { previous: 'cmd+ctrl+alt+shift+f3', next: 'cmd+ctrl+alt+shift+f4', keyboard: ['cmd+ctrl+alt+shift+f3', 'cmd+ctrl+alt+shift+f4', 'cmd+ctrl+alt+f10'] },
    sessions: { previous: 'cmd+ctrl+alt+f11', next: 'cmd+ctrl+alt+f12', keyboard: ['cmd+ctrl+alt+f11', 'cmd+ctrl+alt+f12', 'cmd+ctrl+alt+shift+f1'] },
  };
  for (const model of models) {
    const original = device(openLogiProfile({ ...options, model })).per_app_bindings;
    assert.deepEqual(device(openLogiProfile({ ...options, model, preset: 'tabs' })).per_app_bindings, original);
    for (const [preset, mapping] of Object.entries(expected)) {
      const bindings = device(openLogiProfile({ ...options, model, preset })).per_app_bindings['com.superlogical.rex'];
      if (model === 'mx-keys') {
        assert.deepEqual(['KeySearch', 'KeyScreenCapture', 'KeyCalculator'].map(key => bindings[key].CustomShortcut), mapping.keyboard);
      } else {
        assert.equal(bindings.Back.CustomShortcut, mapping.previous);
        assert.equal(bindings.Forward.CustomShortcut, mapping.next);
        assert.equal(bindings.ThumbwheelScrollUp.CustomShortcut, mapping.previous);
        assert.equal(bindings.ThumbwheelScrollDown.CustomShortcut, mapping.next);
        assert.equal(bindings.MiddleClick.CustomShortcut, 'cmd+ctrl+alt+f9');
        assert.equal(bindings.DpiToggle.CustomShortcut, 'cmd+ctrl+alt+f1');
      }
      assert.ok(Object.values(bindings).every(binding => !binding.RunShellCommand));
    }
  }
});

test('unknown workflow presets fail instead of silently selecting tabs', () => {
  for (const preset of ['', 'other', '__proto__', 'constructor', 'tabs\n', 'PANES']) {
    assert.throws(() => openLogiProfile({ ...options, model: 'mx-master-4', preset }), /preset/i);
  }
});

test('native profiles do not require a Node or CLI executable path', () => {
  const profile = openLogiProfile({ model: 'mx-master-3s', device: options.device });
  const bindings = device(profile).per_app_bindings['com.superlogical.rex'];
  assert.equal(bindings.Back.CustomShortcut, shortcuts['previous-tab']);
  assert.equal(bindings.MiddleClick.CustomShortcut, shortcuts['zoom-pane']);
  assert.ok(!profile.includes('/legacy/'));
});

test('every preset and gesture chord names an existing non-destructive Rex command', () => {
  for (const preset of ['tabs', 'panes', 'sessions']) {
    for (const model of models) {
      const parsed = device(openLogiProfile({ ...options, model, preset, gestures: model !== 'mx-keys' }));
      const bindings = [
        ...Object.values(parsed.per_app_bindings['com.superlogical.rex']),
        ...Object.values(Object.values(parsed.bindings || {})[0] || {}),
      ];
      for (const binding of bindings) {
        const id = Object.keys(shortcuts).find(id => shortcuts[id] === binding.CustomShortcut);
        assert.ok(id, JSON.stringify(binding));
        assert.ok(actions.some(a => a.id === id));
        assert.ok(!id.startsWith('close-'));
        assert.ok(!binding.RunShellCommand);
      }
    }
  }
  assert.equal(functionKeyActions.length, 12);
});

test('gesture output names the old per-app binding to remove before merging', () => {
  for (const model of ['mx-master-3s', 'mx-master-4']) {
    const owner = model === 'mx-master-4' ? 'HapticPanel' : 'GestureButton';
    const installed = device(openLogiProfile({ ...options, model }));
    const fragment = openLogiProfile({ ...options, model, gestures: true });
    const replacement = device(fragment);
    assert.ok(fragment.includes(`Remove ${owner} from ${scope}`));
    assert.match(fragment, /device-wide, not per-app/);
    assert.match(fragment, /other apps may handle these chords/);
    assert.ok(!replacement.per_app_bindings['com.superlogical.rex'][owner]);
    // Follow the generated migration instruction before applying the fragment.
    delete installed.per_app_bindings['com.superlogical.rex'][owner];
    Object.assign(installed.per_app_bindings['com.superlogical.rex'], replacement.per_app_bindings['com.superlogical.rex']);
    installed.bindings = { ...installed.bindings, ...replacement.bindings };
    const effective = { ...installed.bindings, ...installed.per_app_bindings['com.superlogical.rex'] };
    assert.deepEqual(effective[owner], replacement.bindings[owner]);
    assert.deepEqual(Object.keys(effective[owner]), ['Click', 'Left', 'Right', 'Up', 'Down']);
  }
});

test('device identities with quotes and backslashes remain one valid TOML key', () => {
  const identity = 'unit:it\'s "quoted"\\safe';
  const profile = openLogiProfile({ model: 'mx-master-4', device: identity });
  assert.deepEqual(Object.keys(parse(profile).devices), [identity]);
  assert.ok(device(profile, identity).per_app_bindings['com.superlogical.rex'].HapticPanel);
});

test('rejects unknown models, empty identities, control characters, and keyboard gestures', () => {
  for (const change of [{ model: 'other' }, { device: '' }, { device: 'bad\nname' }, { device: 'bad\u0000name' }, { model: 'mx-keys', gestures: true }]) {
    assert.throws(() => openLogiProfile({ ...options, model: 'mx-master-3s', ...change }));
  }
});
