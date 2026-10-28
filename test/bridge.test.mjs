import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RexBridge, execute, isRexForeground } from '../dist/bridge.mjs';
import { actions, adjustments } from '../dist/catalog.mjs';
import { pluginActions } from '../dist/actions.mjs';

const local = { client_id: 'client:local', info: { kind: 'app', label: 'my-mac' }, principal: { transport: 'unix' }, connection_state: 'connected' };
const remote = { ...local, client_id: 'client:remote', principal: { transport: 'tailscale' } };

function fixture({ clients = [remote, local], available = actions.map(a => ({ name: a.action })), foreground = async () => true, fail = false, ...config } = {}) {
  const calls = [];
  const run = async (file, args) => {
    calls.push({ file, args });
    if (args[0] === 'client') return JSON.stringify({ clients });
    if (args.includes('actions')) return JSON.stringify({ actions: available });
    if (fail) throw new Error('Rex disconnected');
    return 'null';
  };
  return { calls, bridge: new RexBridge({ rexPath: '/fake/rex', ...config }, run, foreground) };
}
const sent = calls => calls.filter(c => c.args.includes('do'));

test('catalog IDs and SDK names are unique, and every adjustment references existing actions', () => {
  assert.equal(new Set(actions.map(a => a.id)).size, actions.length);
  for (const a of adjustments) {
    assert.ok(actions.some(c => c.id === a.negative));
    assert.ok(actions.some(c => c.id === a.positive));
  }
  const registered = pluginActions(fixture().bridge);
  assert.equal(new Set(registered.map(a => a.name)).size, registered.length);
  assert.equal(registered.length, actions.length + adjustments.length);
  for (const action of registered) assert.ok(action.toJson().displayName);
});

test('targets the local app, not the remote app, and sends JSON arguments without a shell', async () => {
  const { bridge, calls } = fixture();
  assert.equal(await bridge.run('focus-left'), true);
  assert.deepEqual(sent(calls)[0].args, ['-C', 'client:local', 'do', 'pane.focus', '--args', '{"direction":"left"}', '--json']);
});

test('malformed Rex discovery responses fail closed', async () => {
  for (const response of ['null', '{}', '{"clients":[null]}', '{"actions":[{}]}']) {
    const bridge = new RexBridge({ rexPath: '/fake/rex' }, async () => response, async () => true);
    await assert.rejects(bridge.clients(), /Unexpected Rex client list/);
    await assert.rejects(bridge.available('local'), /Unexpected Rex action list/);
  }
});

test('explicit client selection skips automatic discovery', async () => {
  const { bridge, calls } = fixture({ client: 'chosen-mac' });
  await bridge.run('new-tab');
  assert.equal(sent(calls)[0].args[1], 'chosen-mac');
  assert.ok(!calls.some(c => c.args[0] === 'client'));
});

for (const clients of [[], [remote], [local, { ...local, client_id: 'client:other' }]]) {
  test(`fails safely with ${clients.length} ambiguous/non-local clients`, async () => {
    const { bridge, calls } = fixture({ clients });
    await assert.rejects(bridge.run('new-tab'), /local Rex apps/);
    assert.equal(sent(calls).length, 0);
  });
}

test('does not send or discover anything outside Rex', async () => {
  const { bridge, calls } = fixture({ foreground: async () => false });
  assert.equal(await bridge.run('new-tab'), false);
  assert.equal(calls.length, 0);
});

test('checks foreground again after discovery', async () => {
  let foreground = true;
  let dispatched = false;
  const bridge = new RexBridge({ rexPath: '/fake/rex', client: 'fixture' }, async (_file, args) => {
    if (args.includes('actions')) {
      foreground = false;
      return JSON.stringify({ actions: [{ name: 'client.tab.new' }] });
    }
    dispatched = true;
    return 'null';
  }, async () => foreground);
  assert.equal(await bridge.run('new-tab'), false);
  assert.equal(dispatched, false);
});

test('input received outside Rex is not replayed after returning to Rex', async () => {
  let foreground = true;
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const calls = [];
  let first = true;
  const bridge = new RexBridge({ rexPath: '/fake/rex', client: 'fixture' }, async (_file, args) => {
    if (args.includes('actions')) {
      if (first) { first = false; entered(); await gate; }
      return JSON.stringify({ actions: [{ name: 'client.tab.next' }, { name: 'client.tab.new' }] });
    }
    calls.push(args[3]);
    return 'null';
  }, async () => foreground);
  const active = bridge.run('next-tab');
  await started;
  foreground = false;
  const outside = bridge.run('new-tab');
  await Promise.resolve();
  foreground = true;
  release();
  assert.equal(await active, true);
  assert.equal(await outside, false);
  assert.deepEqual(calls, ['client.tab.next']);
});

test('slow admission checks do not reorder inputs', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let first = true;
  const { bridge, calls } = fixture({ foreground: async () => {
    if (first) { first = false; return gate; }
    return true;
  } });
  const active = bridge.run('next-tab');
  const following = bridge.run('new-tab');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent(calls).length, 0);
  release(true);
  await Promise.all([active, following]);
  assert.deepEqual(sent(calls).map(c => c.args[3]), ['client.tab.next', 'client.tab.new']);
});

test('an early admission failure is handled without letting later input overtake the queue', async () => {
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  let first = true;
  let failNext = false;
  const calls = [];
  const bridge = new RexBridge({ rexPath: '/fake/rex', client: 'fixture' }, async (_file, args) => {
    if (args.includes('actions')) {
      if (first) { first = false; entered(); await gate; }
      return JSON.stringify({ actions: [{ name: 'client.tab.next' }, { name: 'client.tab.new' }] });
    }
    calls.push(args[3]);
    return 'null';
  }, async () => {
    if (failNext) { failNext = false; throw new Error('admission failed'); }
    return true;
  });
  const active = bridge.run('next-tab');
  await started;
  failNext = true;
  const failed = assert.rejects(bridge.run('new-tab'), /admission failed/);
  const following = bridge.run('next-tab');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 0);
  release();
  await Promise.all([active, failed, following]);
  assert.deepEqual(calls, ['client.tab.next', 'client.tab.next']);
});

test('foreground detection failure fails closed', async () => {
  const { bridge, calls } = fixture({ foreground: async () => { throw new Error('macOS unavailable'); } });
  await assert.rejects(bridge.run('new-tab'), /macOS unavailable/);
  assert.equal(calls.length, 0);
});

test('background actions require an explicit opt-in', async () => {
  const { bridge, calls } = fixture({ requireForeground: false, foreground: async () => { throw new Error('must not check'); } });
  await bridge.run('new-tab');
  assert.equal(sent(calls).length, 1);
});

test('destructive commands are blocked by default, including direct actions', async () => {
  const { bridge, calls } = fixture();
  await assert.rejects(bridge.run('close-pane'), /blocked/);
  await assert.rejects(bridge.perform({ id: 'direct', title: 'Close', action: 'session.close' }), /blocked/);
  assert.equal(calls.length, 0);
  const enabled = fixture({ allowDestructive: true });
  await enabled.bridge.run('close-pane');
  assert.equal(sent(enabled.calls).length, 1);
});

test('rejects unknown and unsupported commands without mutation', async () => {
  const { bridge, calls } = fixture({ available: [] });
  await assert.rejects(bridge.run('not-an-action'), /Unknown action/);
  await assert.rejects(bridge.run('new-tab'), /does not expose client.tab.new/);
  assert.equal(sent(calls).length, 0);
});

test('validates settings at the trust boundary', () => {
  for (const value of [null, [], { typo: true }, { client: '-C' }, { client: '' }, { rexPath: 'rex' }, { requireForeground: 'false' }, { allowDestructive: 1 }, { customActions: {} }]) {
    assert.throws(() => new RexBridge(value));
  }
  for (const custom of [
    { id: 'next-tab', title: 'Duplicate', action: 'pane.zoom' },
    { id: 'custom', title: 'Invalid', action: '--help' },
    { id: 'custom', title: 'Invalid', action: 'pane.zoom', args: [] },
    { id: 'bad id', title: 'Invalid', action: 'pane.zoom' },
  ]) assert.throws(() => new RexBridge({ customActions: [custom] }));
});

test('custom actions cannot reuse SDK adjustment names', () => {
  for (const adjustment of adjustments) {
    const id = `adjust-${adjustment.id}`;
    assert.throws(() => new RexBridge({ customActions: [{ id, title: 'Collision', action: 'pane.zoom' }] }), /Duplicate action id/);
  }
  const bridge = new RexBridge({ customActions: [{ id: 'adjust-tabs-extra', title: 'Distinct', action: 'pane.zoom' }] });
  const names = pluginActions(bridge).map(a => a.name);
  assert.equal(new Set(names).size, names.length);
});

test('custom actions preserve argument strings exactly', async () => {
  const args = { key: 'ctrl+l', note: '$(touch /tmp/never-execute); "quote"' };
  const { bridge, calls } = fixture({
    customActions: [{ id: 'custom', title: 'Custom', action: 'pane.send_key', args }],
    available: [{ name: 'pane.send_key' }],
  });
  await bridge.run('custom');
  assert.deepEqual(JSON.parse(sent(calls)[0].args[5]), args);
});

test('adjustments honor sign and magnitude and reject invalid deltas', async () => {
  const { bridge, calls } = fixture();
  assert.equal(await bridge.adjust('tabs', -3), 3);
  assert.equal(sent(calls).length, 3);
  assert.ok(sent(calls).every(c => c.args.includes('client.tab.previous')));
  assert.equal(await bridge.adjust('tabs', 0), 0);
  for (const delta of [NaN, Infinity, 1.5, 17, -17]) await assert.rejects(bridge.adjust('tabs', delta), /integer/);
  await assert.rejects(bridge.adjust('bad', 1), /Unknown adjustment/);
});

test('stops a multi-tick adjustment when Rex loses focus', async () => {
  let foreground = true;
  let dispatched = 0;
  const bridge = new RexBridge({ rexPath: '/fake/rex', client: 'fixture' }, async (_file, args) => {
    if (args.includes('actions')) return JSON.stringify({ actions: [{ name: 'client.tab.next' }] });
    dispatched++;
    foreground = false;
    return 'null';
  }, async () => foreground);
  assert.equal(await bridge.adjust('tabs', 4), 1);
  assert.equal(dispatched, 1);
});

test('serializes button events and recovers after a failed event', async () => {
  const calls = [];
  let first = true;
  const bridge = new RexBridge({ rexPath: '/fake/rex', client: 'local', requireForeground: false }, async (_file, args) => {
    if (args.includes('actions')) return JSON.stringify({ actions: [{ name: 'client.tab.next' }] });
    calls.push('start');
    await new Promise(resolve => setImmediate(resolve));
    calls.push('end');
    if (first) { first = false; throw new Error('transient failure'); }
    return '';
  });
  const results = await Promise.allSettled([bridge.run('next-tab'), bridge.run('next-tab')]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.deepEqual(calls, ['start', 'end', 'start', 'end']);
});

test('bounds the plugin queue instead of spawning an unbounded wheel burst', async () => {
  const { bridge, calls } = fixture();
  const results = await Promise.allSettled(Array.from({ length: 40 }, () => bridge.run('next-tab')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 32);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => /queued/.test(r.reason.message)));
  assert.equal(sent(calls).length, 32);
});

test('SDK command and adjustment callbacks dispatch to the shared bridge', async () => {
  const { bridge, calls } = fixture();
  const registered = pluginActions(bridge);
  await registered.find(a => a.name === 'rex_next_tab').onKeyDown();
  await registered.find(a => a.name === 'rex_adjust_tabs').execute({ tick: -2 });
  assert.equal(sent(calls).length, 3);
});

test('SDK callbacks propagate failures to the SDK request handler', async () => {
  const { bridge } = fixture({ fail: true });
  const registered = pluginActions(bridge);
  await assert.rejects(registered.find(a => a.name === 'rex_next_tab').onKeyDown(), /Rex disconnected/);
  await assert.rejects(registered.find(a => a.name === 'rex_adjust_tabs').execute({ tick: 100 }), /integer from -16 to 16/);
});

test('real subprocess execution strips inherited Rex pane/client selectors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'logi-rex-env-'));
  const file = join(directory, 'env.mjs');
  const old = Object.fromEntries(['REX_CLIENT', 'REX_SESSION', 'REX_BLOCK'].map(k => [k, process.env[k]]));
  try {
    await writeFile(file, 'console.log(JSON.stringify([process.env.REX_CLIENT, process.env.REX_SESSION, process.env.REX_BLOCK]));');
    for (const key of Object.keys(old)) process.env[key] = 'must-not-inherit';
    assert.deepEqual(JSON.parse(await execute(process.execPath, [file])), [null, null, null]);
  } finally {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});

test('foreground query uses fixed executable arguments and rejects malformed app IDs', { skip: process.platform !== 'darwin' }, async () => {
  const calls = [];
  assert.equal(await isRexForeground(async (file, args) => {
    calls.push({ file, args });
    return args[0] === 'front' ? 'ASN:0x0-0x123:\n' : '    bundleID="com.superlogical.rex"\n';
  }), true);
  assert.equal(calls[1].args.at(-1), 'ASN:0x0-0x123:');
  assert.equal(await isRexForeground(async (_file, args) => args[0] === 'front' ? 'ASN:0x0-0x123:' : 'bundleID="com.apple.Finder"'), false);
  await assert.rejects(isRexForeground(async () => 'bad; command'), /Cannot identify/);
});
