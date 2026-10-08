import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../infrastructure/prisma';

const router = Router();

router.get('/junctions', async (_req, res) => {
  const junctions = await prisma.junction.findMany({
    include: { state: true },
  });
  return res.json(junctions);
});

router.get('/junctions/:id', async (req, res) => {
  const j = await prisma.junction.findUnique({
    where: { id: req.params.id },
    include: { state: true },
  });
  if (!j) return res.status(404).json({ error: 'Junction not found' });
  return res.json(j);
});

const CreateJunctionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

router.post('/junctions', async (req, res) => {
  const parsed = CreateJunctionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues });
  }
  const { id, name } = parsed.data;

  const existing = await prisma.junction.findUnique({ where: { id } });
  if (existing) {
    return res.status(409).json({ error: 'Junction already exists' });
  }

  const j = await prisma.junction.create({
    data: {
      id,
      name,
      mode: 'AUTOMATIC',
      phase: 'ALL_RED',
      controllerStatus: 'ONLINE',
      state: { create: {} },
    },
    include: { state: true },
  });
  return res.status(201).json(j);
});

/**
 * GET /api/junctions/:id/status
 */
router.get('/junctions/:id/status', async (req, res) => {
  const { id } = req.params;

  const junction = await prisma.junction.findUnique({
    where: { id },
    include: { state: true },
  });
  if (!junction || !junction.state) {
    return res.status(404).json({ error: 'Junction not found' });
  }

  const grouped = await prisma.queueEntry.groupBy({
    by: ['direction'],
    where: { junctionId: id, status: 'WAITING' },
    _count: { _all: true },
  });

  const queues = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
  for (const row of grouped) {
    queues[row.direction as keyof typeof queues] = row._count._all;
  }

  const pendingCmd = await prisma.command.findFirst({
    where: { junctionId: id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  const s = junction.state;

  return res.json({
    junction_id: junction.id,
    mode: junction.mode,
    phase: junction.phase,
    controller_status: junction.controllerStatus,
    desired_signals: {
      NORTH: s.desiredNorth,
      SOUTH: s.desiredSouth,
      EAST: s.desiredEast,
      WEST: s.desiredWest,
    },
    actual_signals: {
      NORTH: s.actualNorth,
      SOUTH: s.actualSouth,
      EAST: s.actualEast,
      WEST: s.actualWest,
    },
    emergency_active: s.emergencyActive,
    emergency_direction: s.emergencyDirection,
    manual_override: s.manualOverride,
    queues,
    pending_command: pendingCmd
      ? {
          command_id: pendingCmd.commandId,
          requested_state: pendingCmd.requestedState,
          status: pendingCmd.status,
          created_at: pendingCmd.createdAt,
        }
      : null,
  });
});

export default router;