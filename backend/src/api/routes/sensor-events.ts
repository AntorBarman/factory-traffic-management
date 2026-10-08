import { Router } from 'express';
import { z } from 'zod';
import { processSensorEvent } from '../../application/sensor-event.service';
import { prisma } from '../../infrastructure/prisma';

const router = Router();

const SensorEventSchema = z.object({
  event_id: z.string().min(1),
  junction_id: z.string().min(1),
  direction: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST']),
  event_type: z.enum(['VEHICLE_ARRIVED', 'VEHICLE_CLEARED']),
  vehicle_id: z.string().optional(),
  vehicle_type: z
    .enum(['FORKLIFT', 'TRUCK', 'EMPLOYEE_VEHICLE', 'EMERGENCY'])
    .optional(),
  sequence_no: z.number().int().optional(),
  timestamp: z.string().datetime().optional(),
});

router.post('/sensor-events', async (req, res) => {
  const parsed = SensorEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid sensor event',
      details: parsed.error.issues,
    });
  }
  const e = parsed.data;

  const junction = await prisma.junction.findUnique({
    where: { id: e.junction_id },
  });
  if (!junction) {
    return res
      .status(404)
      .json({ error: `Unknown junction: ${e.junction_id}` });
  }

  try {
    const result = await processSensorEvent({
      event_id: e.event_id,
      junction_id: e.junction_id,
      direction: e.direction,
      event_type: e.event_type,
      vehicle_id: e.vehicle_id,
      vehicle_type: e.vehicle_type,
      sequence_no: e.sequence_no,
      timestamp: e.timestamp,
    });

    if (result.duplicate) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'Event already processed (idempotent)',
      });
    }
    if (!result.accepted) {
      return res.status(422).json({
        success: false,
        message: result.reason,
      });
    }
    return res.status(202).json({ success: true, duplicate: false });
  } catch (err: any) {
    console.error('[sensor-event] error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;