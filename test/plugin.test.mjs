import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { actions, adjustments } from '../dist/catalog.mjs';

const pluginDirectory = resolve(process.env.LOGI_REX_TEST_PLUGIN_DIR || 'dist');

test('built plugin reports command and adjustment failures to the SDK host', { timeout: 15000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'logi-rex-host-'));
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  let child;
  let socket;
  t.after(async () => {
    if (socket) socket.terminate();
    if (child && child.exitCode === null) {
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      await stopped;
    }
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await once(server, 'listening');
  await mkdir(join(directory, 'logi-rex'));
  await writeFile(join(directory, 'logi-rex/config.json'), JSON.stringify({
    rexPath: '/usr/bin/false', client: 'fixture', requireForeground: false,
  }));
  const connected = once(server, 'connection', { signal: AbortSignal.timeout(5000) });
  child = spawn(process.execPath, [join(pluginDirectory, 'index.mjs')], {
    env: {
      ...process.env, XDG_CONFIG_HOME: directory,
      LPS_SERVER_URL: `ws://127.0.0.1:${server.address().port}`,
      LPS_SESSION_TOKEN: 'test-only', LPS_PLUGIN_NAME: 'LogiRex',
      LPS_PLUGIN_PACKAGE_DIRECTORY_PATH: pluginDirectory,
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  [socket] = await connected;
  const [initBytes] = await once(socket, 'message', { signal: AbortSignal.timeout(5000) });
  const init = JSON.parse(initBytes.toString());
  assert.equal(init.name, 'InitConnection');
  socket.send(JSON.stringify({ id: init.id, name: init.name, messageType: 'Response', data: true, failed: false }));
  async function request(id, name, parameters = {}) {
    const response = once(socket, 'message', { signal: AbortSignal.timeout(5000) });
    socket.send(JSON.stringify({ id, name, messageType: 'Request', parameters }));
    const [bytes] = await response;
    const reply = JSON.parse(bytes.toString());
    assert.equal(reply.id, id);
    assert.equal(reply.name, name);
    return reply;
  }
  const list = await request(101, 'GetActionList');
  assert.equal(list.data.commands.length, actions.length);
  assert.equal(list.data.adjustments.length, adjustments.length);
  for (const [id, name, parameters] of [
    [102, 'ExecuteCommand', { actionName: 'rex_next_tab' }],
    [103, 'ExecuteCommand', { actionName: 'rex_close_pane' }],
    [104, 'ExecuteAdjustment', { actionName: 'rex_adjust_tabs', clicks: '17' }],
  ]) {
    const reply = await request(id, name, { pluginName: 'LogiRex', ...parameters });
    assert.equal(reply.failed, true, `${parameters.actionName} must not report success`);
    assert.equal(reply.data, false);
    assert.notEqual(reply.errorCode, 0);
  }
  assert.equal(child.exitCode, null, 'the SDK handles failures without crashing the plugin');
});
