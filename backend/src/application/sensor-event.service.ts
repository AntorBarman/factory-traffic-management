import { Prisma } from '@prisma/client';
import { withJunctionLock } from '../infrastructure/db-lock';
import {
  SensorEventType,
  VehicleType,
  VEHICLE_PRIORITY,
  Direction,
  Phase,
  directionToPhase,
} from '../domain/types';
import { executeTransitionStep } from './traffic-controller';

/**
 * Sensor Event Service.
 *
 * Handles VEHICLE_ARRIVED and VEHICLE_CLEARED events.
 * Guarantees idempotency via `event_id` unique constraint.
 * Enforces queue integrity (never negative).
 *
 * Emergency arrivals trigger a safe preemption to the emergency
 * direction (mode = EMERGENCY, safe GREEN -> YELLOW -> ALL_RED -> GREEN).
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

  // Audit: vehicle detected
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

  // ── Emergency handling: flag + safe preemption ────────
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

    // Trigger safe preemption to the emergency direction
    const currentJunction = await tx.junction.findUnique({
      where: { id: input.junction_id },
    });

    if (currentJunction) {
      const targetPhase = directionToPhase(input.direction);

      if (currentJunction.phase !== targetPhase) {
        // Switch to EMERGENCY mode so auto-scheduler stays out of the way
        await tx.junction.update({
          where: { id: input.junction_id },
          data: { mode: 'EMERGENCY' },
        });

        // Begin safe transition: current phase -> YELLOW -> ALL_RED -> target
        await executeTransitionStep(
          tx,
          input.junction_id,
          currentJunction.phase as Phase,
          targetPhase
        );

        await tx.auditLog.create({
          data: {
            junctionId: input.junction_id,
            eventType: 'EMERGENCY_PREEMPT_REQUESTED',
            direction: input.direction,
            metadata: {
              fromPhase: currentJunction.phase,
              targetPhase,
            },
          },
        });

        console.log(
          `[emergency] ${input.junction_id}: preempting ${currentJunction.phase} -> ${targetPhase}`
        );
      } else {
        // Already serving the emergency direction
        console.log(
          `[emergency] ${input.junction_id}: already serving ${targetPhase}`
        );
      }
    }
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
      await tx.junction.update({
        where: { id: input.junction_id },
        data: { mode: 'AUTOMATIC' },
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