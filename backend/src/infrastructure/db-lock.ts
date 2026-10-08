import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Per-junction serialization using PostgreSQL row-level lock.
 *
 * When two requests target the same junction, the second waits until
 * the first completes. This guarantees consistent state without
 * long blocking locks on unrelated junctions.
 *
 * Uses `SELECT ... FOR UPDATE` inside a Prisma transaction.
 *
 * NOTE: Supabase remote latency + dashboard polling requires generous
 * timeouts. Default Prisma `maxWait: 2000ms` is too aggressive.
 */
export async function withJunctionLock<T>(
  junctionId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Lock the junction row
      await tx.$queryRaw`SELECT id FROM "Junction" WHERE id = ${junctionId} FOR UPDATE`;
      return fn(tx);
    },
    {
      maxWait: 10000,  // How long to wait to acquire a connection from pool
      timeout: 20000,  // How long the transaction itself can run
    }
  );
}