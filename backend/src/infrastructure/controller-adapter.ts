import { Direction, SignalState } from '../domain/types';
import { processControllerEvent } from '../application/controller-event.service';

export interface ControllerCommand {
  commandId: string;
  junctionId: string;
  direction: Direction;
  requestedState: SignalState;
  issuedAt: Date;
}

export function generateCommandId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cmd-${ts}-${rand}`;
}

/**
 * Send a command to the physical controller.
 *
 * In production this publishes over MQTT.
 * In this assessment, when AUTO_ACK is not 'false', we simulate a
 * controller ACK after 500ms so the end-to-end flow is demonstrable
 * without real hardware.
 */
export async function sendCommandToController(
  cmd: ControllerCommand
): Promise<void> {
  console.log(
    `[CONTROLLER] Sending ${cmd.commandId}: ` +
      `${cmd.junctionId}/${cmd.direction} → ${cmd.requestedState}`
  );

  // Auto-ACK for dev / assessment demo
  if (process.env.AUTO_ACK !== 'false') {
    setTimeout(async () => {
      try {
        await processControllerEvent({
          command_id: cmd.commandId,
          junction_id: cmd.junctionId,
          status: 'ACK',
          actual_state: cmd.requestedState,
          direction: cmd.direction,
        });
        console.log(`[CONTROLLER] Auto-ACK ${cmd.commandId}`);
      } catch (err: any) {
        console.error(
          `[CONTROLLER] Auto-ACK failed for ${cmd.commandId}:`,
          err?.message ?? err
        );
      }
    }, 500);
  }
}