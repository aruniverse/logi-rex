import { CommandAction, AdjustmentAction, type AdjustmentActionExecuteEvent } from '@logitech/plugin-sdk';
import { adjustments, type RexAction } from './catalog';
import { RexBridge } from './bridge';

export class RexCommand extends CommandAction {
  readonly name: string;
  readonly groupName = 'Rex commands';
  displayName: string;
  description: string;
  private readonly invoke: () => Promise<unknown>;

  constructor(action: RexAction, bridge: RexBridge) {
    super();
    this.name = `rex_${action.id.replaceAll('-', '_')}`;
    this.displayName = action.title;
    this.description = `Rex: ${action.action}. Runs only while Rex is frontmost by default.`;
    this.invoke = () => bridge.run(action.id);
  }

  async onKeyDown(): Promise<void> {
    await this.invoke();
  }
}

export class RexAdjustment extends AdjustmentAction {
  readonly name: string;
  readonly groupName = 'Rex wheels and dials';
  readonly hasReset = false;
  displayName: string;
  description: string;
  private readonly bridge: RexBridge;
  private readonly id: string;

  constructor(adjustment: typeof adjustments[number], bridge: RexBridge) {
    super();
    this.id = adjustment.id;
    this.name = `rex_adjust_${adjustment.id.replaceAll('-', '_')}`;
    this.displayName = adjustment.title;
    this.description = `Turn backward / forward to ${adjustment.title.toLowerCase()} in Rex.`;
    this.bridge = bridge;
  }

  async execute(event: AdjustmentActionExecuteEvent): Promise<void> {
    await this.bridge.adjust(this.id, event.tick);
  }
}

export function pluginActions(bridge: RexBridge): (RexCommand | RexAdjustment)[] {
  return [
    ...bridge.commands.map(action => new RexCommand(action, bridge)),
    ...adjustments.map(adjustment => new RexAdjustment(adjustment, bridge)),
  ];
}
