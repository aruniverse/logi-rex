import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { actions, adjustments, destructiveActions, type RexAction } from './catalog';
import { validateAction, validateConfig, type Config } from './config';

const exec = promisify(execFile);
export type Execute = (file: string, args: string[]) => Promise<string>;

export const execute: Execute = async (file, args) => {
  const env = { ...process.env };
  // Device events must target the app, never the pane that built or launched this plugin.
  for (const key of ['REX_CLIENT', 'REX_SESSION', 'REX_BLOCK']) delete env[key];
  try {
    const result = await exec(file, args, { env, timeout: 5000, maxBuffer: 1024 * 1024, encoding: 'utf8' });
    return result.stdout;
  } catch (error) {
    const e = error as Error & { stderr?: string; code?: string; killed?: boolean };
    throw new Error(`${file}: ${e.killed ? 'request timed out' : e.stderr?.trim() || e.code || 'request failed'}`);
  }
};

export async function resolveRex(config: Config): Promise<string> {
  if (config.rexPath) {
    await access(config.rexPath, constants.X_OK);
    return config.rexPath;
  }
  const candidates = [
    ...(process.env.PATH || '').split(delimiter).filter(Boolean).map(p => join(p, 'rex')),
    join(homedir(), 'Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex'),
    '/opt/homebrew/bin/rex', '/usr/local/bin/rex',
  ];
  for (const path of candidates) {
    try { await access(path, constants.X_OK); return path; } catch { /* Try the next installed location. */ }
  }
  throw new Error('Rex CLI not found. Install Rex, or set rexPath in the logi-rex config.');
}

export async function isRexForeground(run: Execute = execute): Promise<boolean> {
  if (process.platform !== 'darwin') throw new Error('Foreground detection currently supports macOS only.');
  const front = (await run('/usr/bin/lsappinfo', ['front'])).trim();
  if (!/^ASN:0x[0-9a-f]+-0x[0-9a-f]+:$/i.test(front)) throw new Error('Cannot identify the frontmost macOS app; refusing to send input.');
  const info = await run('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', front]);
  return /bundleID\s*=\s*"com\.superlogical\.rex"/.test(info);
}

export type RexClient = {
  client_id: string;
  info?: { kind?: string; label?: string; name?: string; platform?: string; version?: string };
  principal?: { transport?: string };
  connection_state?: string;
};
export type AvailableAction = { name: string; title?: string; args?: unknown };

export class RexBridge {
  readonly config: Config;
  readonly commands: RexAction[];
  private readonly exec: Execute;
  private readonly foreground: () => Promise<boolean>;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(config: Config = {}, run: Execute = execute, foreground: () => Promise<boolean> = () => isRexForeground(run)) {
    this.config = validateConfig(config);
    this.commands = [...actions, ...(config.customActions || [])];
    this.exec = run;
    this.foreground = foreground;
  }

  private async request(args: string[]): Promise<string> {
    return this.exec(this.config.rexPath || await resolveRex(this.config), args);
  }

  async serverVersion(): Promise<string> {
    const result = JSON.parse(await this.request(['whoami', '--json'])) as { rex_version?: unknown } | null;
    if (!result || typeof result.rex_version !== 'string' || !result.rex_version.trim()) throw new Error('Rex did not return a server version.');
    return result.rex_version;
  }

  async clients(): Promise<RexClient[]> {
    const result = JSON.parse(await this.request(['client', 'ls', '--json'])) as { clients?: RexClient[] };
    if (!result || !Array.isArray(result.clients) || result.clients.some(c => !c || typeof c.client_id !== 'string')) throw new Error('Unexpected Rex client list.');
    return result.clients;
  }

  async client(): Promise<string> {
    if (this.config.client) return this.config.client;
    const local = (await this.clients()).filter(c => c.info?.kind === 'app' && c.principal?.transport === 'unix' && c.connection_state === 'connected');
    if (local.length !== 1) throw new Error(`Found ${local.length} local Rex apps. Run logi-rex clients and set client in config; remote apps are never auto-selected.`);
    return local[0]!.client_id;
  }

  async available(client?: string): Promise<AvailableAction[]> {
    const result = JSON.parse(await this.request(['-C', client || await this.client(), 'actions', '--json'])) as { actions?: AvailableAction[] };
    if (!result || !Array.isArray(result.actions) || result.actions.some(a => !a || typeof a.name !== 'string')) throw new Error('Unexpected Rex action list.');
    return result.actions;
  }

  async perform(action: RexAction): Promise<boolean> {
    validateAction(action);
    if (destructiveActions.has(action.action) && !this.config.allowDestructive) throw new Error(`${action.title} is blocked. Set allowDestructive: true to opt in to closing processes or sessions.`);
    if (this.pending >= 32) throw new Error('Too many queued Rex actions; slow down the wheel or gesture repeat rate.');
    const foregroundAtArrival = this.config.requireForeground === false ? Promise.resolve(true) : this.foreground();
    // Observe early failures now; the queued await still propagates them in input order.
    void foregroundAtArrival.catch(() => undefined);
    this.pending++;
    const operation = this.tail.then(async () => {
      if (!await foregroundAtArrival) return false;
      if (this.config.requireForeground !== false && !await this.foreground()) return false;
      const client = await this.client();
      if (!(await this.available(client)).some(a => a.name === action.action)) throw new Error(`This Rex version does not expose ${action.action}. Update Rex or choose another action.`);
      // Discovery may take time; do not send a stale device event after switching apps.
      if (this.config.requireForeground !== false && !await this.foreground()) return false;
      await this.request(['-C', client, 'do', action.action, '--args', JSON.stringify(action.args || {}), '--json']);
      return true;
    });
    this.tail = operation.catch(() => undefined);
    try { return await operation; } finally { this.pending--; }
  }

  async run(id: string): Promise<boolean> {
    const action = this.commands.find(a => a.id === id);
    if (!action) throw new Error(`Unknown action: ${id}. Run logi-rex actions for valid IDs.`);
    return this.perform(action);
  }

  async adjust(id: string, ticks: number): Promise<number> {
    const adjustment = adjustments.find(a => a.id === id);
    if (!adjustment) throw new Error(`Unknown adjustment: ${id}`);
    if (!Number.isSafeInteger(ticks) || Math.abs(ticks) > 16) throw new Error('Adjustment delta must be an integer from -16 to 16.');
    let sent = 0;
    for (let i = 0; i < Math.abs(ticks); i++) {
      if (!await this.run(ticks > 0 ? adjustment.positive : adjustment.negative)) break;
      sent++;
    }
    return sent;
  }
}
