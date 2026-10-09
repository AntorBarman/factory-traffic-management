import { withJunctionLock } from '../infrastructure/db-lock';
import { SignalState } from '../domain/types';

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

    // Idempotency: already terminal
    if (
      command.status === 'ACK' ||
      command.status === 'FAILED' ||
      command.status === 'TIMEOUT'
    ) {
      return {
        accepted: true,
        message: `Command already terminal: ${command.status}`,
      };
    }

    // ── ACK ──────────────────────────────────────────────
    if (input.status === 'ACK') {
      // Sync actual state to desired state for ALL directions
      const state = await tx.junctionState.findUnique({
        where: { junctionId: input.junction_id },
      });

      if (state) {
        await tx.junctionState.update({
          where: { junctionId: input.junction_id },
          data: {
            actualNorth: state.desiredNorth,
            actualSouth: state.desiredSouth,
            actualEast: state.desiredEast,
            actualWest: state.desiredWest,
          },
        });

        // Sync junction.phase from desired signals
        const signals = [
          state.desiredNorth,
          state.desiredSouth,
          state.desiredEast,
          state.desiredWest,
        ];
        if (signals.every((s) => s === 'RED')) {
          await tx.junction.update({
            where: { id: input.junction_id },
            data: { phase: 'ALL_RED' },
          });
        } else if (
          state.desiredNorth === 'GREEN' ||
          state.desiredSouth === 'GREEN'
        ) {
          await tx.junction.update({
            where: { id: input.junction_id },
            data: { phase: 'NORTH_SOUTH' },
          });
        } else if (
          state.desiredEast === 'GREEN' ||
          state.desiredWest === 'GREEN'
        ) {
          await tx.junction.update({
            where: { id: input.junction_id },
            data: { phase: 'EAST_WEST' },
          });
        }
      }

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

    // ── NACK ─────────────────────────────────────────────
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

    // ── TIMEOUT ──────────────────────────────────────────
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
      return {
        accepted: true,
        message: 'Timeout recorded; controller degraded',
      };
    }

    return { accepted: false, message: 'Invalid controller event' };
  });
}

/**
 * Expire stale PENDING commands.
 */
export async function expireStaleCommands(
  prisma: any,
  timeoutMs: number
): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs);
  const stale = await prisma.command.findMany({
    where: { status: 'PENDING', sentAt: { lt: cutoff } },
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