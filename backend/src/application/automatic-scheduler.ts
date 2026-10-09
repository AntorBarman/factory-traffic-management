import { Prisma } from '@prisma/client';
import { prisma } from '../infrastructure/prisma';
import { withJunctionLock } from '../infrastructure/db-lock';
import { Direction, Phase, TIMINGS, directionToPhase } from '../domain/types';
import { pickNextPhase, QueueSnapshot } from '../domain/scheduler';
import {
  applyDesiredSignals,
  executeTransitionStep,
} from './traffic-controller';

let running = false;

export async function runAutomaticScheduler(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const junctions = await prisma.junction.findMany({ select: { id: true } });
    for (const { id } of junctions) {
      try {
        await driveJunction(id);
      } catch (err: any) {
        console.error(
          `[auto-scheduler] junction ${id} failed:`,
          err?.message ?? err
        );
      }
    }
  } finally {
    running = false;
  }
}

async function driveJunction(junctionId: string): Promise<void> {
  await withJunctionLock(junctionId, async (tx) => {
    const junction = await tx.junction.findUnique({
      where: { id: junctionId },
      include: { state: true },
    });

    if (!junction || !junction.state) return;
    if (junction.controllerStatus !== 'ONLINE') return;

    const pendingCount = await tx.command.count({
      where: { junctionId, status: 'PENDING' },
    });
    if (pendingCount > 0) return;

    const s = junction.state;
    const currentPhase = junction.phase as Phase;
    const now = Date.now();

    // ── EMERGENCY: continue mid-transition
    if (junction.mode === 'EMERGENCY') {
      await continueEmergencyTransition(tx, junctionId, junction, now);
      return;
    }

    if (junction.mode !== 'AUTOMATIC') return;
    if (s.emergencyActive) return;

    // ── AUTOMATIC scheduling with mid-transition handling
    const hasYellow =
      s.desiredNorth === 'YELLOW' ||
      s.desiredSouth === 'YELLOW' ||
      s.desiredEast === 'YELLOW' ||
      s.desiredWest === 'YELLOW';

    const lastCmd = await tx.command.findFirst({
      where: { junctionId },
      orderBy: { sentAt: 'desc' },
    });
    const elapsed = lastCmd?.sentAt
      ? now - new Date(lastCmd.sentAt).getTime()
      : Infinity;

    // Stage A: mid-transition (YELLOW) → advance to ALL_RED
    if (hasYellow) {
      if (elapsed < TIMINGS.YELLOW_DURATION_MS) return;
      await applyDesiredSignals(
        tx,
        junctionId,
        { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' },
        'ALL_RED'
      );
      await tx.junction.update({
        where: { id: junctionId },
        data: { phase: 'ALL_RED' },
      });
      await tx.auditLog.create({
        data: {
          junctionId,
          eventType: 'SIGNAL_TRANSITION_STARTED',
          metadata: { from: 'YELLOW', to: 'ALL_RED' },
        },
      });
      console.log(`[auto-scheduler] ${junctionId}: YELLOW → ALL_RED`);
      return;
    }

    // Stage B: in ALL_RED → start next GREEN target
    if (currentPhase === 'ALL_RED') {
      if (elapsed < TIMINGS.ALL_RED_DURATION_MS) return;

      const queues = await loadQueues(tx, junctionId);
      const target = pickNextPhase(queues, currentPhase, now);
      if (!target || target === 'ALL_RED') return;

      await executeTransitionStep(tx, junctionId, 'ALL_RED', target);
      await tx.auditLog.create({
        data: {
          junctionId,
          eventType: 'AUTO_PHASE_DECISION',
          previousState: 'ALL_RED',
          newState: target,
          metadata: {
            queueSizes: {
              NORTH: queues.NORTH.length,
              SOUTH: queues.SOUTH.length,
              EAST: queues.EAST.length,
              WEST: queues.WEST.length,
            },
          },
        },
      });
      console.log(`[auto-scheduler] ${junctionId}: ALL_RED → ${target} GREEN`);
      return;
    }

    // Stage C: in a GREEN phase → decide yield
    const other: Phase =
      currentPhase === 'NORTH_SOUTH' ? 'EAST_WEST' : 'NORTH_SOUTH';

    const queues = await loadQueues(tx, junctionId);
    const nsCount = queues.NORTH.length + queues.SOUTH.length;
    const ewCount = queues.EAST.length + queues.WEST.length;
    const currentCount = currentPhase === 'NORTH_SOUTH' ? nsCount : ewCount;
    const otherCount = currentPhase === 'NORTH_SOUTH' ? ewCount : nsCount;

    const target = pickNextPhase(queues, currentPhase, now);

    const shouldYield =
      (currentCount === 0 && otherCount > 0) ||
      (elapsed >= TIMINGS.GREEN_DURATION_MS && otherCount > 0) ||
      (target !== null && target !== currentPhase && otherCount > 0);

    if (!shouldYield) return;

    await executeTransitionStep(tx, junctionId, currentPhase, other);
    await tx.auditLog.create({
      data: {
        junctionId,
        eventType: 'AUTO_PHASE_DECISION',
        previousState: currentPhase,
        newState: other,
        metadata: {
          reason: 'yield',
          queueSizes: {
            NORTH: queues.NORTH.length,
            SOUTH: queues.SOUTH.length,
            EAST: queues.EAST.length,
            WEST: queues.WEST.length,
          },
        },
      },
    });
    console.log(
      `[auto-scheduler] ${junctionId}: ${currentPhase} → YELLOW (yield to ${other})`
    );
  });
}

async function continueEmergencyTransition(
  tx: Prisma.TransactionClient,
  junctionId: string,
  junction: any,
  now: number
): Promise<void> {
  const s = junction.state;
  const currentPhase = junction.phase as Phase;
  const emergencyDir = s.emergencyDirection as Direction | null;
  if (!emergencyDir) return;

  const targetPhase = directionToPhase(emergencyDir);
  if (currentPhase === targetPhase) return;

  const signals = [
    s.desiredNorth,
    s.desiredSouth,
    s.desiredEast,
    s.desiredWest,
  ];
  const hasYellow = signals.includes('YELLOW');

  const lastCmd = await tx.command.findFirst({
    where: { junctionId },
    orderBy: { sentAt: 'desc' },
  });
  const elapsed = lastCmd?.sentAt
    ? now - new Date(lastCmd.sentAt).getTime()
    : Infinity;

  if (hasYellow) {
    if (elapsed < TIMINGS.YELLOW_DURATION_MS) return;
    await applyDesiredSignals(
      tx,
      junctionId,
      { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' },
      'ALL_RED_EMERGENCY'
    );
    await tx.junction.update({
      where: { id: junctionId },
      data: { phase: 'ALL_RED' },
    });
    console.log(`[auto-scheduler] ${junctionId}: YELLOW → ALL_RED (emergency)`);
    return;
  }

  if (currentPhase === 'ALL_RED') {
    if (elapsed < TIMINGS.ALL_RED_DURATION_MS) return;
    await executeTransitionStep(tx, junctionId, 'ALL_RED', targetPhase);
    console.log(`[auto-scheduler] ${junctionId}: ALL_RED → ${targetPhase} (emergency)`);
    return;
  }

  // Fallback: current GREEN but not target — start YELLOW
  await executeTransitionStep(tx, junctionId, currentPhase, targetPhase);
  console.log(`[auto-scheduler] ${junctionId}: ${currentPhase} → YELLOW (emergency)`);
}

async function loadQueues(
  tx: Prisma.TransactionClient,
  junctionId: string
): Promise<QueueSnapshot> {
  const waiting = await tx.queueEntry.findMany({
    where: { junctionId, status: 'WAITING' },
    orderBy: { arrivedAt: 'asc' },
  });

  const snap: QueueSnapshot = {
    NORTH: [],
    SOUTH: [],
    EAST: [],
    WEST: [],
  };

  for (const v of waiting) {
    const dir = v.direction as Direction;
    if (snap[dir]) {
      snap[dir].push({
        vehicleType: v.vehicleType,
        arrivedAt: v.arrivedAt,
      });
    }
  }

  return snap;
}