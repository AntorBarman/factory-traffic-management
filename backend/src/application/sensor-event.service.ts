import { Prisma } from '@prisma/client';
import { withJunctionLock } from '../infrastructure/db-lock';
import {
  SensorEventType,
  VehicleType,
  VEHICLE_PRIORITY,
  Direction,
} from '../domain/types';

/**
 * Sensor Event Service.
 *
 * Handles VEHICLE_ARRIVED and VEHICLE_CLEARED events.
 * Guarantees idempotency via `event_id` unique constraint.
 * Enforces queue integrity (never negative).
 */

export interface SensorEventInput {
  event_id: string;
  junction_id: string;
  direction: Direction;
  event_type: SensorEventType;
  vehicle_id?: string;
  vehicle_type?: VehicleType;
  sequence_no?: number;
  timestamp?: string;
}

export interface SensorEventResult {
  accepted: boolean;
  duplicate: boolean;
  reason?: string;
}

export async function processSensorEvent(
  input: SensorEventInput
): Promise<SensorEventResult> {
  return withJunctionLock(input.junction_id, async (tx) => {
    // Idempotency: check for existing event_id
    const existing = await tx.sensorEvent.findUnique({
      where: { eventId: input.event_id },
    });

    if (existing) {
      await tx.auditLog.create({
        data: {
          junctionId: input.junction_id,
          eventType: 'DUPLICATE_SENSOR_EVENT',
          direction: input.direction,
          metadata: { eventId: input.event_id },
        },
      });
      return { accepted: true, duplicate: true };
    }

    // Persist the event first
    await tx.sensorEvent.create({
      data: {
        eventId: input.event_id,
        junctionId: input.junction_id,
        direction: input.direction,
        eventType: input.event_type,
        vehicleId: input.vehicle_id ?? null,
        vehicleType: input.vehicle_type ?? null,
        sequenceNo: input.sequence_no ?? null,
        sensorTimestamp: input.timestamp ? new Date(input.timestamp) : null,
        status: 'PROCESSED',
      },
    });

    // Route by event type
    if (input.event_type === 'VEHICLE_ARRIVED') {
      return handleArrival(tx, input);
    } else {
      return handleCleared(tx, input);
    }
  });
}

async function handleArrival(
  tx: Prisma.TransactionClient,
  input: SensorEventInput
): Promise<SensorEventResult> {
  if (!input.vehicle_id || !input.vehicle_type) {
    return {
      accepted: false,
      duplicate: false,
      reason: 'VEHICLE_ARRIVED requires vehicle_id and vehicle_type',
    };
  }

  // Insert queue entry
  await tx.queueEntry.create({
    data: {
      junctionId: input.junction_id,
      vehicleId: input.vehicle_id,
      direction: input.direction,
      vehicleType: input.vehicle_type,
      priority: VEHICLE_PRIORITY[input.vehicle_type] ?? 1,
      status: 'WAITING',
    },
  });

  // Audit
  await tx.auditLog.create({
    data: {
      junctionId: input.junction_id,
      eventType: 'VEHICLE_DETECTED',
      direction: input.direction,
      metadata: {
        eventId: input.event_id,
        vehicleId: input.vehicle_id,
        vehicleType: input.vehicle_type,
      },
    },
  });

  // Emergency: flag state
  if (input.vehicle_type === 'EMERGENCY') {
    await tx.junctionState.update({
      where: { junctionId: input.junction_id },
      data: {
        emergencyActive: true,
        emergencyDirection: input.direction,
      },
    });
    await tx.auditLog.create({
      data: {
        junctionId: input.junction_id,
        eventType: 'EMERGENCY_DETECTED',
        direction: input.direction,
        metadata: {
          vehicleId: input.vehicle_id,
          eventId: input.event_id,
        },
      },
    });
  }

  return { accepted: true, duplicate: false };
}

async function handleCleared(
  tx: Prisma.TransactionClient,
  input: SensorEventInput
): Promise<SensorEventResult> {
  if (!input.vehicle_id) {
    return {
      accepted: false,
      duplicate: false,
      reason: 'VEHICLE_CLEARED requires vehicle_id',
    };
  }

  const active = await tx.queueEntry.findFirst({
    where: {
      junctionId: input.junction_id,
      vehicleId: input.vehicle_id,
      status: 'WAITING',
    },
  });

  if (!active) {
    // No matching arrival — do not decrement below zero. Log anomaly.
    await tx.auditLog.create({
      data: {
        junctionId: input.junction_id,
        eventType: 'CLEARED_WITHOUT_ARRIVAL',
        direction: input.direction,
        metadata: {
          vehicleId: input.vehicle_id,
          eventId: input.event_id,
        },
      },
    });
    return {
      accepted: false,
      duplicate: false,
      reason: 'No active queue entry for this vehicle',
    };
  }

  await tx.queueEntry.update({
    where: { id: active.id },
    data: { status: 'CLEARED', clearedAt: new Date() },
  });

  // If emergency cleared, release emergency flag when no more emergency
  // vehicles remain queued.
  if (active.vehicleType === 'EMERGENCY') {
    const remainingEmergency = await tx.queueEntry.count({
      where: {
        junctionId: input.junction_id,
        status: 'WAITING',
        vehicleType: 'EMERGENCY',
      },
    });
    if (remainingEmergency === 0) {
      await tx.junctionState.update({
        where: { junctionId: input.junction_id },
        data: { emergencyActive: false, emergencyDirection: null },
      });
      await tx.auditLog.create({
        data: {
          junctionId: input.junction_id,
          eventType: 'EMERGENCY_CLEARED',
          direction: input.direction,
        },
      });
    }
  }

  await tx.auditLog.create({
    data: {
      junctionId: input.junction_id,
      eventType: 'VEHICLE_CLEARED',
      direction: input.direction,
      metadata: { vehicleId: input.vehicle_id },
    },
  });

  return { accepted: true, duplicate: false };
}