import {
  Direction,
  Phase,
  SignalState,
  PHASE_DIRECTIONS,
} from './types';

/**
 * Centralized safety rules for traffic signal transitions.
 *
 * INVARIANTS:
 * 1. Conflicting phases must NEVER receive GREEN simultaneously.
 * 2. GREEN must NEVER transition directly to a conflicting GREEN.
 * 3. Manual / emergency commands must NOT bypass the safe-transition sequence.
 * 4. Invalid requests must NOT place the junction into an unsafe state.
 */

/**
 * Allowed phase transitions. Only these pairs are safe.
 * A phase transitions to YELLOW first (implicit), then ALL_RED, then next GREEN phase.
 */
const ALLOWED_PHASE_TRANSITIONS: Record<Phase, Phase[]> = {
  NORTH_SOUTH: ['ALL_RED'],
  EAST_WEST: ['ALL_RED'],
  ALL_RED: ['NORTH_SOUTH', 'EAST_WEST'],
};

/**
 * Check if a transition from `from` to `to` is structurally allowed.
 */
export function isAllowedTransition(from: Phase, to: Phase): boolean {
  if (from === to) return false;
  return ALLOWED_PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the full safe-transition sequence from current phase to target phase.
 *
 * Example: NORTH_SOUTH → EAST_WEST
 *   ['ALL_RED', 'EAST_WEST']
 *
 * Caller is responsible for executing YELLOW + ALL_RED timing between steps.
 */
export function planSafeTransition(
  from: Phase,
  to: Phase
): Phase[] {
  if (from === to) return [];

  // If already at ALL_RED, direct to target
  if (from === 'ALL_RED') {
    return [to];
  }

  // Otherwise: current → ALL_RED → target
  return ['ALL_RED', to];
}

/**
 * Compute desired signal states for each direction given a phase.
 */
export function signalsForPhase(
  phase: Phase
): Record<Direction, SignalState> {
  const greenDirections = PHASE_DIRECTIONS[phase];

  return {
    NORTH: greenDirections.includes('NORTH') ? 'GREEN' : 'RED',
    SOUTH: greenDirections.includes('SOUTH') ? 'GREEN' : 'RED',
    EAST: greenDirections.includes('EAST') ? 'GREEN' : 'RED',
    WEST: greenDirections.includes('WEST') ? 'GREEN' : 'RED',
  };
}

/**
 * Assert that no safety invariant is violated.
 * Throws if conflicting directions are GREEN simultaneously.
 */
export function assertSafetyInvariant(
  signals: Record<Direction, SignalState>
): void {
  const nsGreen =
    signals.NORTH === 'GREEN' || signals.SOUTH === 'GREEN';
  const ewGreen =
    signals.EAST === 'GREEN' || signals.WEST === 'GREEN';

  if (nsGreen && ewGreen) {
    throw new Error(
      'SAFETY VIOLATION: Conflicting GREEN signals detected ' +
        JSON.stringify(signals)
    );
  }
}

/**
 * Verify that a phase string is a valid Phase.
 */
export function isValidPhase(value: string): value is Phase {
  return ['NORTH_SOUTH', 'EAST_WEST', 'ALL_RED'].includes(value);
}

/**
 * Verify that a direction string is a valid Direction.
 */
export function isValidDirection(value: string): value is Direction {
  return ['NORTH', 'SOUTH', 'EAST', 'WEST'].includes(value);
}