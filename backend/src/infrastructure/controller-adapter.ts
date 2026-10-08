import { Direction, SignalState } from '../domain/types';

/**
 * Controller Adapter — simulates physical traffic signal controller.
 *
 * In production, this would publish MQTT commands and listen for
 * acknowledgements. Here, we emit a `command_id` and expect the
 * caller (API layer / simulated controller) to ACK it.
 *
 * The adapter does NOT assume the physical state changed. The caller
 * must wait for ACK before updating `actual_state`.
 */

export interface ControllerCommand {
  commandId: string;
  junctionId: string;
  direction: Direction;
  requestedState: SignalState;
  issuedAt: Date;
}

/**
 * Generate a unique command ID.
 */
export function generateCommandId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cmd-${ts}-${rand}`;
}

/**
 * "Send" a command to the physical controller.
 *
 * In this assessment, sending is a no-op — the evaluator will POST
 * to /api/controller-events to simulate the ACK. In a real MQTT setup,
 * this method would publish to `junction/{id}/command`.
 */
export async function sendCommandToController(
  cmd: ControllerCommand
): Promise<void> {
  // Log for visibility. Real implementation: MQTT publish.
  console.log(
    `[CONTROLLER] Sending ${cmd.commandId}: ` +
      `${cmd.junctionId}/${cmd.direction} → ${cmd.requestedState}`
  );
}