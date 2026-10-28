import { actions, adjustments } from './catalog';
import { RexBridge, execute, isRexForeground, resolveRex } from './bridge';
import { configPath, loadConfig, validateConfig, type Config } from './config';

export type DoctorReport = {
  ok: boolean;
  rexPath: string | null;
  configPath: string;
  serverVersion: string | null;
  appVersion: string | null;
  client: string | null;
  clientLabel: string | null;
  foreground: boolean | null;
  requireForeground: boolean;
  allowDestructive: boolean;
  commands: number;
  adjustments: number;
  unavailable: string[];
  warnings: string[];
  errors: string[];
};

export async function doctor(file?: string, overrides: Config = {}): Promise<DoctorReport> {
  const report: DoctorReport = {
    ok: false, rexPath: null, configPath: file || configPath(),
    serverVersion: null, appVersion: null, client: null, clientLabel: null,
    foreground: null, requireForeground: true, allowDestructive: false,
    commands: actions.length, adjustments: adjustments.length, unavailable: [],
    warnings: ['Native keybindings and physical-device integration are not checked.'], errors: [],
  };
  try {
    const config = validateConfig({ ...await loadConfig(file, file !== undefined), ...overrides });
    report.requireForeground = config.requireForeground !== false;
    report.allowDestructive = config.allowDestructive === true;
    report.rexPath = await resolveRex(config);
    const bridge = new RexBridge({ ...config, rexPath: report.rexPath },
      (file, args) => execute(file, ['--autostart=false', ...args]), isRexForeground);
    report.commands = bridge.commands.length;
    try { report.serverVersion = await bridge.serverVersion(); }
    catch (error) { report.warnings.push(`Server version lookup failed: ${(error as Error).message}`); }
    report.client = await bridge.client();
    const clients = (await bridge.clients()).filter(c => c.info?.kind === 'app' && c.connection_state === 'connected');
    const matches = clients.filter(c => c.client_id === report.client || c.info?.label === report.client || c.client_id.endsWith(report.client!));
    if (matches.length === 1) {
      report.client = matches[0]!.client_id;
      const info = matches[0]!.info;
      report.appVersion = typeof info?.version === 'string' ? info.version : null;
      report.clientLabel = typeof info?.label === 'string' ? info.label : null;
    }
    if (!report.appVersion) report.warnings.push('App version is unknown. Use a full app client ID from logi-rex clients when reporting compatibility.');
    const available = await bridge.available(report.client);
    report.unavailable = bridge.commands.filter(a => !available.some(v => v.name === a.action)).map(a => a.id);
    if (report.unavailable.length) report.errors.push(`Missing commands: ${report.unavailable.join(', ')}. Update Rex or remove unsupported custom actions from ${report.configPath}.`);
    if (report.requireForeground) {
      report.foreground = await isRexForeground();
      if (!report.foreground) report.warnings.push('Rex is not frontmost. Bring Rex to the front before using bridge controls.');
    } else {
      report.warnings.push('Foreground protection is disabled; bridge controls can affect Rex while another app is active.');
    }
  } catch (error) {
    report.errors.push(`${(error as Error).message} Check ${report.configPath}, confirm Rex is running, and use logi-rex clients to select the app.`);
  }
  report.ok = report.errors.length === 0;
  return report;
}

export function formatDoctor(report: DoctorReport): string {
  return [
    `logi-rex doctor: ${report.ok ? 'OK' : 'FAIL'}`,
    `Rex CLI: ${report.rexPath || 'not found'}`,
    `Rex server: ${report.serverVersion || 'unknown'}`,
    `Rex app: ${report.appVersion || 'unknown'}`,
    `Target: ${report.client || 'not selected'}${report.clientLabel ? ` (${JSON.stringify(report.clientLabel)})` : ''}`,
    `Config: ${report.configPath}`,
    `Commands: ${report.commands}; adjustments: ${report.adjustments}; unavailable: ${report.unavailable.length}`,
    ...report.errors.map(error => `ERROR: ${error}`),
    ...report.warnings.map(warning => `WARN: ${warning}`),
  ].join('\n');
}
