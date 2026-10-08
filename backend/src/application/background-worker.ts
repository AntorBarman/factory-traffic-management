import { prisma } from '../infrastructure/prisma';
import { expireStaleCommands } from './controller-event.service';
import { TIMINGS } from '../domain/types';

/**
 * Background worker.
 *
 * Two responsibilities:
 * 1. Expire stale PENDING commands after timeout.
 * 2. (Future) Drive phase transitions when their scheduled time arrives.
 *
 * Runs on a fixed interval (non-blocking). No sleep() in request handlers.
 */
let started = false;

export function startBackgroundWorker(): void {
  if (started) return;
  started = true;

  // Command timeout check — every 2 seconds
  setInterval(async () => {
    try {
      const n = await expireStaleCommands(
        prisma,
        TIMINGS.COMMAND_TIMEOUT_MS
      );
      if (n > 0) {
        console.log(`[worker] Expired ${n} stale command(s)`);
      }
    } catch (err) {
      console.error('[worker] timeout scan failed:', err);
    }
  }, 2000);

  console.log('[worker] Background worker started');
}