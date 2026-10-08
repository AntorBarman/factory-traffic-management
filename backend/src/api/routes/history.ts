import { Router } from 'express';
import { prisma } from '../../infrastructure/prisma';

const router = Router();

router.get('/junctions/:id/history', async (req, res) => {
  const limit = Math.min(
    parseInt((req.query.limit as string) ?? '50', 10) || 50,
    200
  );
  const logs = await prisma.auditLog.findMany({
    where: { junctionId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return res.json({ junction_id: req.params.id, count: logs.length, logs });
});

export default router;