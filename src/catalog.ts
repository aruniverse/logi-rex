export type RexAction = {
  id: string;
  title: string;
  action: string;
  args?: Record<string, unknown>;
};

const command = (id: string, title: string, action: string, args?: Record<string, unknown>): RexAction =>
  args ? { id, title, action, args } : { id, title, action };

export const actions: RexAction[] = [
  command('next-tab', 'Next tab', 'client.tab.next'),
  command('previous-tab', 'Previous tab', 'client.tab.previous'),
  command('new-tab', 'New tab', 'client.tab.new'),
  command('close-tab', 'Close tab (destructive)', 'client.tab.close'),
  command('rename-tab', 'Rename tab', 'client.tab.rename'),
  command('last-tab', 'Last tab', 'client.tab.goto', { index: -1 }),
  ...Array.from({ length: 9 }, (_, i) => command(`tab-${i + 1}`, `Go to tab ${i + 1}`, 'client.tab.goto', { index: i + 1 })),
  command('move-tab-left', 'Move tab left', 'client.tab.move.backward'),
  command('move-tab-right', 'Move tab right', 'client.tab.move.forward'),
  command('detach-tab', 'Move tab to new window', 'client.tab.move_to_new_window'),
  ...['left', 'right', 'up', 'down'].flatMap(direction => [
    command(`focus-${direction}`, `Focus pane ${direction}`, 'pane.focus', { direction }),
    command(`split-${direction}`, `Split pane ${direction}`, 'pane.split', { direction }),
    command(`move-pane-${direction}`, `Move pane ${direction}`, 'pane.move', { direction }),
    command(`resize-${direction}`, `Resize pane ${direction}`, 'pane.resize', { direction }),
  ]),
  command('next-pane', 'Next pane', 'pane.focus_next'),
  command('previous-pane', 'Previous pane', 'pane.focus_previous'),
  command('split-auto', 'Split pane (best fit)', 'pane.split.auto'),
  command('zoom-pane', 'Zoom / restore pane', 'pane.zoom'),
  command('balance-panes', 'Balance splits', 'pane.balance'),
  command('close-pane', 'Close pane (destructive)', 'pane.close'),
  command('pane-to-tab', 'Move pane to new tab', 'pane.move_to_new_tab'),
  command('next-session', 'Next session', 'session.next'),
  command('previous-session', 'Previous session', 'session.previous'),
  command('switch-session', 'Choose session', 'session.switch'),
  command('new-session', 'New session', 'session.new'),
  command('rename-session', 'Rename session', 'session.rename'),
  command('close-session', 'Close session (destructive)', 'session.close'),
  command('command-palette', 'Command palette', 'client.palette.toggle'),
  command('find', 'Find', 'client.find.open'),
  command('find-next', 'Find next', 'client.find.next'),
  command('find-previous', 'Find previous', 'client.find.previous'),
  command('previous-prompt', 'Previous prompt', 'client.prompt.previous'),
  command('next-prompt', 'Next prompt', 'client.prompt.next'),
  command('font-increase', 'Increase font size', 'client.font.increase'),
  command('font-decrease', 'Decrease font size', 'client.font.decrease'),
  command('font-reset', 'Reset font size', 'client.font.reset'),
  command('toggle-sidebar', 'Toggle sidebar', 'client.sidebar.toggle'),
  command('toggle-activity', 'Toggle activity', 'client.sidebar.activity.toggle'),
  command('toggle-fullscreen', 'Toggle full screen', 'client.window.fullscreen.toggle'),
  command('new-window', 'New window', 'client.window.new'),
  command('theme-picker', 'Choose theme', 'client.theme.change'),
  command('toggle-appearance', 'Toggle light / dark', 'client.appearance.switch_mode', { mode: 'toggle' }),
  command('settings', 'Rex settings', 'client.settings'),
  command('reload-config', 'Reload Rex config', 'client.config.reload'),
];

export const adjustments = [
  { id: 'tabs', title: 'Cycle tabs', negative: 'previous-tab', positive: 'next-tab' },
  { id: 'panes', title: 'Cycle panes', negative: 'previous-pane', positive: 'next-pane' },
  { id: 'sessions', title: 'Cycle sessions', negative: 'previous-session', positive: 'next-session' },
  { id: 'font', title: 'Font size', negative: 'font-decrease', positive: 'font-increase' },
  { id: 'prompts', title: 'Jump between prompts', negative: 'previous-prompt', positive: 'next-prompt' },
  { id: 'resize-horizontal', title: 'Resize split horizontally', negative: 'resize-left', positive: 'resize-right' },
  { id: 'resize-vertical', title: 'Resize split vertically', negative: 'resize-up', positive: 'resize-down' },
];

export const destructiveActions = new Set([
  'client.close', 'client.window.close', 'client.tab.close', 'pane.close', 'session.close',
  'client.server.restart', 'client.update.accept', 'client.host.remove',
]);
