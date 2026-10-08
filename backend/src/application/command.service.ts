import { withJunctionLock } from '../infrastructure/db-lock';
import { Direction, Phase, directionToPhase } from '../domain/types';
import {
  isValidDirection,
  assertSafetyInvariant,
} from '../domain/state-machine';
import {
  executeTransitionStep,
  planNextTarget,
} from './traffic-controller';

/**
 * Command Service.
 * Accepts intent from API layer; issues safe transitions.
 * Never accepts arbitrary signal-state writes from clients.
 */

export interface CommandInput {
  command: string;
  direction?: string;
}

export interface CommandResult {
  accepted: boolean;
  message: string;
}

export async function processCommand(
  junctionId: string,
  input: CommandInput
): Promise<CommandResult> {
  return withJunctionLock(junctionId, async (tx) => {
    const junction = await tx.junction.findUnique({
      where: { id: junctionId },
      include: { state: true },
    });
    if (!junction || !junction.state) {
      return { accepted: false, message: 'Junction not found' };
    }

    const currentPhase = junction.phase as Phase;

    // ---- MANUAL_GREEN_REQUEST ----
    if (input.command === 'MANUAL_GREEN_REQUEST') {
      if (!input.direction || !isValidDirection(input.direction)) {
        return {
          accepted: false,
          message: 'MANUAL_GREEN_REQUEST requires valid direction',
        };
      }
      const dir = input.direction as Direction;
      const targetPhase = directionToPhase(dir);

      await tx.junction.update({
        where: { id: junctionId },
        data: { mode: 'MANUAL' },
      });
      await tx.junctionState.update({
        where: { junctionId },
        data: { manualOverride: true },
      });

      await tx.auditLog.create({
        data: {
          junctionId,
          eventType: 'MANUAL_OVERRIDE',
          direction: dir,
          metadata: { requestedPhase: targetPhase },
        },
      });

      const steps = planNextTarget(currentPhase, targetPhase);
      if (steps.length === 0) {
        return {
          accepted: true,
          message: `Already in ${targetPhase} phase`,
        };
      }

      await executeTransitionStep(tx, junctionId, currentPhase, targetPhase);

      return {
        accepted: true,
        message: `Manual green requested for ${dir}; safe transition started`,
      };
    }

    // ---- RETURN_TO_AUTOMATIC ----
    if (input.command === 'RETURN_TO_AUTOMATIC') {
      await tx.junction.update({
        where: { id: junctionId },
        data: { mode: 'AUTOMATIC' },
      });
      await tx.junctionState.update({
        where: { junctionId },
        data: { manualOverride: false },
      });
      await tx.auditLog.create({
        data: {
          junctionId,
          eventType: 'RETURN_TO_AUTOMATIC',
        },
      });
      return { accepted: true, message: 'Returned to AUTOMATIC mode' };
    }

    // ---- EMERGENCY_PREEMPT ----
    if (input.command === 'EMERGENCY_PREEMPT') {
      if (!input.direction || !isValidDirection(input.direction)) {
        return {
          accepted: false,
          message: 'EMERGENCY_PREEMPT requires valid direction',
        };
      }
      const dir = input.direction as Direction;
      const targetPhase = directionToPhase(dir);

      await tx.junction.update({
        where: { id: junctionId },
        data: { mode: 'EMERGENCY' },
      });
      await tx.junctionState.update({
        where: { junctionId },
        data: { emergencyActive: true, emergencyDirection: dir },
      });

      await tx.auditLog.create({
        data: {
          junctionId,
          eventType: 'EMERGENCY_PREEMPT_REQUESTED',
          direction: dir,
        },
      });

      const steps = planNextTarget(currentPhase, targetPhase);
      if (steps.length === 0) {
        return {
          accepted: true,
          message: `Already in ${targetPhase} phase`,
        };
      }
      await executeTransitionStep(tx, junctionId, currentPhase, targetPhase);
      return {
        accepted: true,
        message: `Emergency preemption started for ${dir}`,
      };
    }

    // ---- CLEAR_EMERGENCY ----
    if (input.command === 'CLEAR_EMERGENCY') {
      await tx.junctionState.update({
        where: { junctionId },
        data: { emergencyActive: false, emergencyDirection: null },
      });
      await tx.junction.update({
        where: { id: junctionId },
        data: { mode: 'AUTOMATIC' },
      });
      await tx.auditLog.create({
        data: {
          junctionId,
          eventType: 'EMERGENCY_CLEARED',
        },
      });
      return { accepted: true, message: 'Emergency cleared' };
    }

    return {
      accepted: false,
      message: `Unknown command: ${input.command}`,
    };
  });
}

/**
 * Developer helper — validate a signal configuration for safety.
 * Used by tests; not exposed via API.
 */
export function validateSignalsForSafety(signals: any): void {
  assertSafetyInvariant(signals);
}