import { withJunctionLock } from '../infrastructure/db-lock';
import { SignalState } from '../domain/types';

/**
 * Controller Event Service.
 *
 * Handles ACK messages from the physical controller. Updates `actual_state`
 * ONLY when the ACK confirms the change.
 *
 * Duplicate ACKs are idempotent (state already correct → no-op).
 */

export interface ControllerEventInput {
  command_id: string;
  junction_id: string;
  status: 'ACK' | 'NACK' | 'TIMEOUT';
  actual_state?: SignalState;
  direction?: string;
}

export interface ControllerEventResult {
  accepted: boolean;
  message: string;
}

export async function processControllerEvent(
  input: ControllerEventInput
): Promise<ControllerEventResult> {
  return withJunctionLock(input.junction_id, async (tx) => {
    const command = await tx.command.findUnique({
      where: { commandId: input.command_id },
    });

    if (!command) {
      return { accepted: false, message: 'Unknown command_id' };
    }

    // Idempotency: if already resolved, no-op.
    if (command.status === 'ACK' || command.status === 'FAILED') {
      return {
        accepted: true,
        message: `Command already in terminal status: ${command.status}`,
      };
    }

    if (input.status === 'ACK' && input.actual_state && input.direction) {
      // Update actual signal state for the reported direction
      const dirKey = `actual${capitalize(input.direction)}` as
        | 'actualNorth'
        | 'actualSouth'
        | 'actualEast'
        | 'actualWest';

      await tx.junctionState.update({
        where: { junctionId: input.junction_id },
        data: { [dirKey]: input.actual_state } as any,
      });

      await tx.command.update({
        where: { commandId: input.command_id },
        data: { status: 'ACK', ackedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          junctionId: input.junction_id,
          eventType: 'CONTROLLER_ACK',
          direction: input.direction,
          newState: input.actual_state,
          commandId: input.command_id,
        },
      });

      return { accepted: true, message: 'ACK recorded' };
    }

    if (input.status === 'NACK') {
      await tx.command.update({
        where: { commandId: input.command_id },
        data: { status: 'FAILED' },
      });
      await tx.junction.update({
        where: { id: input.junction_id },
        data: { controllerStatus: 'DEGRADED' },
      });
      await tx.auditLog.create({
        data: {
          junctionId: input.junction_id,
          eventType: 'CONTROLLER_NACK',
          commandId: input.command_id,
        },
      });
      return { accepted: true, message: 'NACK recorded; controller degraded' };
    }

    if (input.status === 'TIMEOUT') {
      await tx.command.update({
        where: { commandId: input.command_id },
        data: { status: 'TIMEOUT' },
      });
      await tx.junction.update({
        where: { id: input.junction_id },
        data: { controllerStatus: 'DEGRADED' },
      });
      await tx.auditLog.create({
        data: {
          junctionId: input.junction_id,
          eventType: 'CONTROLLER_TIMEOUT',
          commandId: input.command_id,
        },
      });
      return { accepted: true, message: 'Timeout recorded; controller degraded' };
    }

    return { accepted: false, message: 'Invalid controller event' };
  });
}

/**
 * Scan for PENDING commands past their timeout window.
 * Called by a background worker.
 */
export async function expireStaleCommands(
  prisma: any,
  timeoutMs: number
): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs);
  const stale = await prisma.command.findMany({
    where: {
      status: 'PENDING',
      sentAt: { lt: cutoff },
    },
  });
  let expired = 0;
  for (const cmd of stale) {
    await prisma.$transaction(async (tx: any) => {
      await tx.command.update({
        where: { commandId: cmd.commandId },
        data: { status: 'TIMEOUT' },
      });
      await tx.junction.update({
        where: { id: cmd.junctionId },
        data: { controllerStatus: 'DEGRADED' },
      });
      await tx.auditLog.create({
        data: {
          junctionId: cmd.junctionId,
          eventType: 'CONTROLLER_TIMEOUT',
          commandId: cmd.commandId,
        },
      });
    });
    expired++;
  }
  return expired;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}