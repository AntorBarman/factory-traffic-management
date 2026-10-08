import {
  Direction,
  Phase,
  VEHICLE_PRIORITY,
  VehicleType,
  TIMINGS,
} from './types';

/**
 * Scheduling algorithm.
 *
 * score(direction) = queueSize × 10
 *                  + Σ(vehiclePriority × 20)
 *                  + Σ(min(waitSeconds, 120) × 0.5)
 *                  + starvationBonus (if oldest wait > 60s)
 *
 * The phase with the highest total score across its directions wins.
 *
 * Design rationale:
 * - Queue size dominates base score (10 per vehicle).
 * - Vehicle priority adds 20 per vehicle (TRUCK beats 2 employees).
 * - Waiting time adds up to 60 points (capped at 120s wait).
 * - Starvation bonus of 200 ensures low-priority traffic gets served.
 */

export interface WaitingVehicle {
  vehicleType: string;
  arrivedAt: Date | string;  // DB returns Date, tests pass Date
}

export interface QueueSnapshot {
  NORTH: WaitingVehicle[];
  SOUTH: WaitingVehicle[];
  EAST: WaitingVehicle[];
  WEST: WaitingVehicle[];
}

const STARVATION_BONUS = 200;

/**
 * Compute a score for a single direction's queue.
 */
export function scoreDirection(
  queue: WaitingVehicle[],
  now: number
): number {
  let score = 0;
  for (const v of queue) {
    const priority = VEHICLE_PRIORITY[v.vehicleType as VehicleType] ?? 1;
    const waitSec = (now - new Date(v.arrivedAt).getTime()) / 1000;

    score += 10;
    score += priority * 20;
    score += Math.min(waitSec, 120) * 0.5;

    if (waitSec > TIMINGS.STARVATION_THRESHOLD_SEC) {
      score += STARVATION_BONUS;
    }
  }
  return score;
}

/**
 * Compute the score for a phase.
 */
export function scorePhase(
  queue: QueueSnapshot,
  phase: Phase,
  now: number
): number {
  switch (phase) {
    case 'NORTH_SOUTH':
      return (
        scoreDirection(queue.NORTH, now) +
        scoreDirection(queue.SOUTH, now)
      );
    case 'EAST_WEST':
      return (
        scoreDirection(queue.EAST, now) +
        scoreDirection(queue.WEST, now)
      );
    case 'ALL_RED':
      return 0;
  }
}

/**
 * Pick the next phase to serve.
 * Returns the phase with highest score, or null if no vehicles are waiting.
 */
export function pickNextPhase(
  queue: QueueSnapshot,
  currentPhase: Phase,
  now: number
): Phase | null {
  const nsScore = scorePhase(queue, 'NORTH_SOUTH', now);
  const ewScore = scorePhase(queue, 'EAST_WEST', now);

  if (nsScore === 0 && ewScore === 0) return null;

  // Hysteresis: stay on current phase unless the other is clearly better (25% margin)
  // Avoids unnecessary switching when scores are close.
  const HYSTERESIS = 0.25;
  if (currentPhase === 'NORTH_SOUTH') {
    if (nsScore >= ewScore * (1 - HYSTERESIS)) return 'NORTH_SOUTH';
    return 'EAST_WEST';
  }
  if (currentPhase === 'EAST_WEST') {
    if (ewScore >= nsScore * (1 - HYSTERESIS)) return 'EAST_WEST';
    return 'NORTH_SOUTH';
  }

  // ALL_RED — pick highest
  return nsScore >= ewScore ? 'NORTH_SOUTH' : 'EAST_WEST';
}

/**
 * Find the direction with the highest priority vehicle in a phase.
 * Used for emergency preemption selection.
 */
export function findHighestPriorityDirection(
  queue: QueueSnapshot,
  directions: Direction[]
): Direction | null {
  let best: Direction | null = null;
  let bestPriority = 0;

  for (const dir of directions) {
    for (const v of queue[dir]) {
      const p = VEHICLE_PRIORITY[v.vehicleType as VehicleType] ?? 1;
      if (p > bestPriority) {
        bestPriority = p;
        best = dir;
      }
    }
  }
  return best;
}