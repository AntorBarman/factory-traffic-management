import { Router } from 'express';
import { z } from 'zod';
import { processControllerEvent } from '../../application/controller-event.service';

const router = Router();

const ControllerEventSchema = z.object({
  command_id: z.string().min(1),
  junction_id: z.string().min(1),
  status: z.enum(['ACK', 'NACK', 'TIMEOUT']),
  actual_state: z.enum(['RED', 'YELLOW', 'GREEN']).optional(),
  direction: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST']).optional(),
});

router.post('/controller-events', async (req, res) => {
  const parsed = ControllerEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }
  try {
    const result = await processControllerEvent(parsed.data);
    if (!result.accepted) {
      return res.status(404).json(result);
    }
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[controller-event] error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;