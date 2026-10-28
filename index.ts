import { PluginSDK } from '@logitech/plugin-sdk';
import { pluginActions } from './src/actions';
import { RexBridge } from './src/bridge';
import { loadConfig } from './src/config';

try {
  const bridge = new RexBridge(await loadConfig());
  const sdk = new PluginSDK();
  for (const action of pluginActions(bridge)) sdk.registerAction(action);
  await sdk.connect();
} catch (error) {
  console.error(`[logi-rex] ${(error as Error).message}`);
  process.exitCode = 1;
}
