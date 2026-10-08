/**
 * Domain Types — pure TypeScript, no external dependencies.
 * These types are shared across domain, application, and infrastructure layers.
 */

export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export type SignalState = 'RED' | 'YELLOW' | 'GREEN';

export type Phase = 'NORTH_SOUTH' | 'EAST_WEST' | 'ALL_RED';

export type JunctionMode =
  | 'AUTOMATIC'
  | 'MANUAL'
  | 'EMERGENCY'
  | 'DEGRADED';

export type ControllerStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'DEGRADED'
  | 'WARNING'
  | 'UNKNOWN';

export type VehicleType =
  | 'FORKLIFT'
  | 'TRUCK'
  | 'EMPLOYEE_VEHICLE'
  | 'EMERGENCY';

export type SensorEventType = 'VEHICLE_ARRIVED' | 'VEHICLE_CLEARED';

export type CommandStatus = 'PENDING' | 'ACK' | 'TIMEOUT' | 'FAILED';

/**
 * Priority weights for scheduling.
 * Higher number = higher priority.
 */
export const VEHICLE_PRIORITY: Record<VehicleType, number> = {
  EMERGENCY: 4,
  TRUCK: 3,
  FORKLIFT: 2,
  EMPLOYEE_VEHICLE: 1,
};

/**
 * Directions belonging to each phase.
 */
export const PHASE_DIRECTIONS: Record<Phase, Direction[]> = {
  NORTH_SOUTH: ['NORTH', 'SOUTH'],
  EAST_WEST: ['EAST', 'WEST'],
  ALL_RED: [],
};

/**
 * Which phase is requested by a given direction.
 */
export function directionToPhase(direction: Direction): Phase {
  return direction === 'NORTH' || direction === 'SOUTH'
    ? 'NORTH_SOUTH'
    : 'EAST_WEST';
}

/**
 * Timing constants (milliseconds).
 * Configurable via env or DB in production; hardcoded for assessment.
 */
export const TIMINGS = {
  GREEN_DURATION_MS: 30_000,
  YELLOW_DURATION_MS: 5_000,
  ALL_RED_DURATION_MS: 2_000,
  COMMAND_TIMEOUT_MS: 10_000,
  MANUAL_OVERRIDE_TIMEOUT_MS: 120_000,
  STARVATION_THRESHOLD_SEC: 60,
} as const;