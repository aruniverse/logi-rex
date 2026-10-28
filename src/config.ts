import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { actions, adjustments, type RexAction } from './catalog';

export type Config = {
  rexPath?: string;
  client?: string;
  requireForeground?: boolean;
  allowDestructive?: boolean;
  customActions?: RexAction[];
};

export function validateAction(value: unknown): asserts value is RexAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Action must be an object.');
  const a = value as Record<string, unknown>;
  if (typeof a.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(a.id)) throw new Error('Action id must use lowercase letters, digits, and hyphens.');
  if (typeof a.title !== 'string' || !a.title.trim()) throw new Error(`Action ${a.id} needs a title.`);
  if (typeof a.action !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(a.action)) throw new Error(`Invalid Rex action name for ${a.id}.`);
  if (a.args !== undefined && (!a.args || typeof a.args !== 'object' || Array.isArray(a.args))) throw new Error(`Action ${a.id} args must be an object.`);
}

export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Config must be a JSON object.');
  const c = value as Record<string, unknown>;
  const allowed = new Set(['rexPath', 'client', 'requireForeground', 'allowDestructive', 'customActions']);
  for (const key of Object.keys(c)) if (!allowed.has(key)) throw new Error(`Unknown config key: ${key}`);
  if (c.rexPath !== undefined && (typeof c.rexPath !== 'string' || !isAbsolute(c.rexPath))) throw new Error('rexPath must be an absolute executable path.');
  if (c.client !== undefined && (typeof c.client !== 'string' || !c.client.trim() || c.client.startsWith('-'))) throw new Error('client must be a non-empty Rex client ID or label, not an option.');
  for (const key of ['requireForeground', 'allowDestructive']) {
    if (c[key] !== undefined && typeof c[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
  }
  if (c.customActions !== undefined) {
    if (!Array.isArray(c.customActions)) throw new Error('customActions must be an array.');
    const ids = new Set([...actions.map(a => a.id), ...adjustments.map(a => `adjust-${a.id}`)]);
    for (const a of c.customActions) {
      validateAction(a);
      if (ids.has(a.id)) throw new Error(`Duplicate action id: ${a.id}`);
      ids.add(a.id);
    }
  }
  return c as Config;
}

export function configPath(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'logi-rex', 'config.json');
}

export async function loadConfig(path = configPath(), required = false): Promise<Config> {
  let content: string;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Cannot read config ${path}: ${(error as Error).message}`);
  }
  try {
    return validateConfig(JSON.parse(content));
  } catch (error) {
    throw new Error(`Invalid config ${path}: ${(error as Error).message}`);
  }
}
