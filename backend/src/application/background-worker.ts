import { prisma } from '../infrastructure/prisma';
import { expireStaleCommands } from './controller-event.service';
import { TIMINGS } from '../domain/types';
import { runAutomaticScheduler } from './automatic-scheduler';

let started = false;

export function startBackgroundWorker(): void {
  if (started) return;
  started = true;

  // ── Task 1: Expire stale PENDING commands (every 2s)
  setInterval(async () => {
    try {
      const n = await expireStaleCommands(
        prisma,
        TIMINGS.COMMAND_TIMEOUT_MS
      );
      if (n > 0) {
        console.log(`[worker] Expired ${n} stale command(s)`);
      }
    } catch (err: any) {
      console.error('[worker] timeout scan failed:', err?.message ?? err);
    }
  }, 2000);

  // ── Task 2: Automatic traffic scheduler (every 3s)
  setInterval(async () => {
    try {
      await runAutomaticScheduler();
    } catch (err: any) {
      console.error('[worker] auto-scheduler failed:', err?.message ?? err);
    }
  }, 3000);

  console.log('[worker] Background worker started');
}

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (reason: any) => {
  console.error('[process] Unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception:', err);
});