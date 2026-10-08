import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { processSensorEvent } from '../src/application/sensor-event.service';

const prisma = new PrismaClient();

const TEST_JUNCTION = 'TEST-IDEM';

/**
 * Delete children FIRST (FK order), then parent.
 */
async function cleanupJunction() {
  await prisma.queueEntry.deleteMany({ where: { junctionId: TEST_JUNCTION } });
  await prisma.sensorEvent.deleteMany({ where: { junctionId: TEST_JUNCTION } });
  await prisma.auditLog.deleteMany({ where: { junctionId: TEST_JUNCTION } });
  await prisma.command.deleteMany({ where: { junctionId: TEST_JUNCTION } });
  await prisma.junctionState.deleteMany({ where: { junctionId: TEST_JUNCTION } });
  await prisma.junction.deleteMany({ where: { id: TEST_JUNCTION } });
}

async function setupJunction() {
  await cleanupJunction();
  await prisma.junction.create({
    data: {
      id: TEST_JUNCTION,
      name: 'Test Idempotency Junction',
      state: { create: {} },
    },
  });
}

afterAll(async () => {
  await cleanupJunction();
  await prisma.$disconnect();
});

describe('Idempotency — duplicate sensor events', () => {
  beforeEach(async () => {
    await setupJunction();
  });

  it('processes first VEHICLE_ARRIVED successfully', async () => {
    const result = await processSensorEvent({
      event_id: 'idem-evt-1',
      junction_id: TEST_JUNCTION,
      direction: 'NORTH',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: 'VH-1',
      vehicle_type: 'TRUCK',
    });
    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);

    const count = await prisma.queueEntry.count({
      where: { junctionId: TEST_JUNCTION, status: 'WAITING' },
    });
    expect(count).toBe(1);
  }, 20000);

  it('marks second submission of same event_id as duplicate', async () => {
    const input = {
      event_id: 'idem-evt-2',
      junction_id: TEST_JUNCTION,
      direction: 'NORTH' as const,
      event_type: 'VEHICLE_ARRIVED' as const,
      vehicle_id: 'VH-2',
      vehicle_type: 'TRUCK' as const,
    };

    const first = await processSensorEvent(input);
    const second = await processSensorEvent(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    const count = await prisma.queueEntry.count({
      where: { junctionId: TEST_JUNCTION, status: 'WAITING' },
    });
    expect(count).toBe(1);
  }, 20000);

  it('handles VEHICLE_CLEARED without matching arrival gracefully', async () => {
    const result = await processSensorEvent({
      event_id: 'idem-clear-1',
      junction_id: TEST_JUNCTION,
      direction: 'NORTH',
      event_type: 'VEHICLE_CLEARED',
      vehicle_id: 'VH-NONEXISTENT',
    });

    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('No active queue entry');

    const count = await prisma.queueEntry.count({
      where: { junctionId: TEST_JUNCTION, status: 'WAITING' },
    });
    expect(count).toBe(0);
  }, 20000);

  it('decrements queue on VEHICLE_CLEARED for existing vehicle', async () => {
    await processSensorEvent({
      event_id: 'arrive-clear-1',
      junction_id: TEST_JUNCTION,
      direction: 'NORTH',
      event_type: 'VEHICLE_ARRIVED',
      vehicle_id: 'VH-10',
      vehicle_type: 'FORKLIFT',
    });

    const before = await prisma.queueEntry.count({
      where: { junctionId: TEST_JUNCTION, status: 'WAITING' },
    });
    expect(before).toBe(1);

    const result = await processSensorEvent({
      event_id: 'arrive-clear-2',
      junction_id: TEST_JUNCTION,
      direction: 'NORTH',
      event_type: 'VEHICLE_CLEARED',
      vehicle_id: 'VH-10',
    });

    expect(result.accepted).toBe(true);

    const after = await prisma.queueEntry.count({
      where: { junctionId: TEST_JUNCTION, status: 'WAITING' },
    });
    expect(after).toBe(0);
  }, 20000);
});