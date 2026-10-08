import { describe, it, expect } from 'vitest';
import {
  isAllowedTransition,
  planSafeTransition,
  signalsForPhase,
  assertSafetyInvariant,
} from '../src/domain/state-machine';

describe('State machine — safety invariants', () => {
  it('never allows direct NORTH_SOUTH → EAST_WEST', () => {
    expect(isAllowedTransition('NORTH_SOUTH', 'EAST_WEST')).toBe(false);
  });

  it('never allows direct EAST_WEST → NORTH_SOUTH', () => {
    expect(isAllowedTransition('EAST_WEST', 'NORTH_SOUTH')).toBe(false);
  });

  it('allows NORTH_SOUTH → ALL_RED', () => {
    expect(isAllowedTransition('NORTH_SOUTH', 'ALL_RED')).toBe(true);
  });

  it('plans safe transition NORTH_SOUTH → EAST_WEST via ALL_RED', () => {
    expect(planSafeTransition('NORTH_SOUTH', 'EAST_WEST')).toEqual([
      'ALL_RED',
      'EAST_WEST',
    ]);
  });

  it('never produces conflicting GREEN in any phase', () => {
    const phases = ['NORTH_SOUTH', 'EAST_WEST', 'ALL_RED'] as const;
    for (const p of phases) {
      const signals = signalsForPhase(p);
      expect(() => assertSafetyInvariant(signals)).not.toThrow();
    }
  });

  it('NORTH_SOUTH gives GREEN to N/S and RED to E/W', () => {
    const s = signalsForPhase('NORTH_SOUTH');
    expect(s.NORTH).toBe('GREEN');
    expect(s.SOUTH).toBe('GREEN');
    expect(s.EAST).toBe('RED');
    expect(s.WEST).toBe('RED');
  });

  it('ALL_RED gives RED to all', () => {
    const s = signalsForPhase('ALL_RED');
    expect(s.NORTH).toBe('RED');
    expect(s.SOUTH).toBe('RED');
    expect(s.EAST).toBe('RED');
    expect(s.WEST).toBe('RED');
  });
});