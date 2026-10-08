import { describe, it, expect } from 'vitest';
import { scoreDirection, scorePhase, pickNextPhase } from '../src/domain/scheduler';

function vehicle(type: string, ageSeconds: number) {
  return {
    vehicleType: type,
    arrivedAt: new Date(Date.now() - ageSeconds * 1000),
  };
}

describe('Scheduler — scoring', () => {
  it('scores empty queue as 0', () => {
    expect(scoreDirection([], Date.now())).toBe(0);
  });

  it('scores higher for more vehicles', () => {
    const now = Date.now();
    const one = scoreDirection([vehicle('TRUCK', 0)], now);
    const two = scoreDirection([vehicle('TRUCK', 0), vehicle('TRUCK', 0)], now);
    expect(two).toBeGreaterThan(one);
  });

  it('scores EMERGENCY higher than EMPLOYEE_VEHICLE', () => {
    const now = Date.now();
    const emg = scoreDirection([vehicle('EMERGENCY', 0)], now);
    const emp = scoreDirection([vehicle('EMPLOYEE_VEHICLE', 0)], now);
    expect(emg).toBeGreaterThan(emp);
  });

  it('scores TRUCK higher than FORKLIFT', () => {
    const now = Date.now();
    const truck = scoreDirection([vehicle('TRUCK', 0)], now);
    const forklift = scoreDirection([vehicle('FORKLIFT', 0)], now);
    expect(truck).toBeGreaterThan(forklift);
  });

  it('adds starvation bonus when wait > 60s', () => {
    const now = Date.now();
    const fresh = scoreDirection([vehicle('EMPLOYEE_VEHICLE', 0)], now);
    const starved = scoreDirection([vehicle('EMPLOYEE_VEHICLE', 61)], now);
    expect(starved).toBeGreaterThan(fresh + 100);
  });
});

describe('Scheduler — phase selection', () => {
  it('returns null when all queues empty', () => {
    const empty = { NORTH: [], SOUTH: [], EAST: [], WEST: [] };
    expect(pickNextPhase(empty, 'ALL_RED', Date.now())).toBeNull();
  });

  it('picks NORTH_SOUTH when only N has vehicles', () => {
    const q = {
      NORTH: [vehicle('TRUCK', 0)],
      SOUTH: [],
      EAST: [],
      WEST: [],
    };
    expect(pickNextPhase(q, 'ALL_RED', Date.now())).toBe('NORTH_SOUTH');
  });

  it('picks EAST_WEST when only E has vehicles', () => {
    const q = {
      NORTH: [],
      SOUTH: [],
      EAST: [vehicle('TRUCK', 0)],
      WEST: [],
    };
    expect(pickNextPhase(q, 'ALL_RED', Date.now())).toBe('EAST_WEST');
  });

  it('picks the phase with higher total score', () => {
    const q = {
      NORTH: [vehicle('EMPLOYEE_VEHICLE', 0)],
      SOUTH: [],
      EAST: [vehicle('TRUCK', 0), vehicle('TRUCK', 0)],
      WEST: [],
    };
    // Two trucks (score ~80) beats one employee vehicle (score ~40)
    expect(pickNextPhase(q, 'ALL_RED', Date.now())).toBe('EAST_WEST');
  });
});