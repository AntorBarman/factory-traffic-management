import { Router } from 'express';
import { z } from 'zod';
import { processCommand } from '../../application/command.service';
import { prisma } from '../../infrastructure/prisma';

const router = Router();

const CommandSchema = z.object({
  command: z.string().min(1),
  direction: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST']).optional(),
});

router.post('/junctions/:id/commands', async (req, res) => {
  const parsed = CommandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }

  const junction = await prisma.junction.findUnique({
    where: { id: req.params.id },
  });
  if (!junction) {
    return res.status(404).json({ error: 'Junction not found' });
  }

  try {
    const result = await processCommand(req.params.id, parsed.data);
    if (!result.accepted) {
      return res.status(422).json(result);
    }
    return res.status(202).json(result);
  } catch (err: any) {
    console.error('[command] error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;