'use client';

import { useEffect, useState, useCallback } from 'react';
import Intersection from '@/components/Intersection';
import ManualControl from '@/components/ManualControl';
import SimulationForm from '@/components/SimulationForm';
import RecentActivity from '@/components/RecentActivity';
import {
  getJunctionStatus,
  getHistory,
  postSensorEvent,
  postCommand,
  postControllerEvent,
} from '@/lib/api';
import { AuditLog, Direction, JunctionStatus } from '@/lib/types';

const REFRESH_MS = 2000;

export default function Home() {
  const [status, setStatus] = useState<JunctionStatus | null>(null);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        getJunctionStatus('A'),
        getHistory('A', 30),
      ]);
      setStatus(s);
      setHistory(h.logs);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message ?? 'Backend unavailable');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleManualRequest(direction: Direction) {
    setActionMsg(null);
    try {
      const res = await postCommand('A', 'MANUAL_GREEN_REQUEST', direction);
      setActionMsg(res.message ?? 'Manual request sent');
      await refresh();
    } catch (err: any) {
      setActionMsg(`❌ ${err.message}`);
    }
  }

  async function handleReturnToAuto() {
    setActionMsg(null);
    try {
      const res = await postCommand('A', 'RETURN_TO_AUTOMATIC');
      setActionMsg(res.message ?? 'Returned to automatic');
      await refresh();
    } catch (err: any) {
      setActionMsg(`❌ ${err.message}`);
    }
  }

  async function handleSensorSubmit(payload: any) {
    await postSensorEvent(payload);
    await refresh();
  }

  async function handleControllerEvent(payload: any) {
    await postControllerEvent(payload);
    await refresh();
  }

  if (!status && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading...
      </div>
    );
  }

  const activeDirections: Direction[] = [];
  if (status) {
    (['NORTH', 'SOUTH', 'EAST', 'WEST'] as Direction[]).forEach((d) => {
      if (status.desired_signals[d] !== 'RED') activeDirections.push(d);
    });
  }

  const isDegraded =
    status?.controller_status === 'DEGRADED' ||
    status?.controller_status === 'OFFLINE';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Factory Traffic Management</h1>
            <p className="text-sm text-slate-400">
              Junction A — Live Dashboard
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            {lastUpdated && (
              <div>Updated: {lastUpdated.toLocaleTimeString()}</div>
            )}
            <div>Auto-refresh: {REFRESH_MS / 1000}s</div>
          </div>
        </header>

        {/* Banners */}
        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-200 text-sm">
            ⚠️ Backend error: {error}
          </div>
        )}

        {status?.emergency_active && (
          <div className="mb-4 p-3 rounded bg-red-900/60 border border-red-500 text-red-100 text-sm font-semibold animate-pulse">
            🚨 EMERGENCY ACTIVE — Direction: {status.emergency_direction}
          </div>
        )}

        {isDegraded && (
          <div className="mb-4 p-3 rounded bg-yellow-900/40 border border-yellow-700 text-yellow-200 text-sm">
            ⚠️ Controller status: {status?.controller_status} — Command may not
            have been executed
          </div>
        )}

        {status?.pending_command && (
          <div className="mb-4 p-3 rounded bg-blue-900/30 border border-blue-800 text-blue-200 text-xs">
            Pending command: {status.pending_command.command_id} →{' '}
            {status.pending_command.requested_state}
          </div>
        )}

        {actionMsg && (
          <div className="mb-4 p-2 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs">
            {actionMsg}
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Intersection */}
          <div className="lg:col-span-2 space-y-4">
            {status && (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
                <Intersection
                  signals={status.desired_signals}
                  queues={status.queues}
                  active={activeDirections}
                />

                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <Stat label="Mode" value={status.mode} />
                  <Stat label="Phase" value={status.phase} />
                  <Stat
                    label="Controller"
                    value={status.controller_status}
                    highlight={isDegraded ? 'warn' : 'ok'}
                  />
                  <Stat
                    label="Manual Override"
                    value={status.manual_override ? 'YES' : 'NO'}
                    highlight={status.manual_override ? 'warn' : undefined}
                  />
                </div>

                <div className="mt-6">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-2">
                    Desired vs Actual
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {(['NORTH', 'SOUTH', 'EAST', 'WEST'] as Direction[]).map(
                      (d) => (
                        <div
                          key={d}
                          className="rounded bg-slate-950 border border-slate-800 p-2"
                        >
                          <div className="text-slate-400">{d}</div>
                          <div className="font-mono">
                            D:{' '}
                            <span
                              className={stateColor(status.desired_signals[d])}
                            >
                              {status.desired_signals[d]}
                            </span>
                          </div>
                          <div className="font-mono">
                            A:{' '}
                            <span
                              className={stateColor(status.actual_signals[d])}
                            >
                              {status.actual_signals[d]}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {status && (
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
                <ManualControl
                  mode={status.mode}
                  disabled={!!error}
                  onManualRequest={handleManualRequest}
                  onReturnToAuto={handleReturnToAuto}
                />
              </div>
            )}
          </div>

          {/* Right column: Simulator + Activity */}
          <div className="space-y-6">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <SimulationForm
                onSubmit={handleSensorSubmit}
                onControllerEvent={handleControllerEvent}
              />
            </div>

            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400 mb-3">
                Recent Activity
              </h3>
              <RecentActivity logs={history} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'ok' | 'warn';
}) {
  const color =
    highlight === 'warn'
      ? 'text-yellow-300'
      : highlight === 'ok'
      ? 'text-green-300'
      : 'text-slate-100';
  return (
    <div className="rounded bg-slate-950 border border-slate-800 p-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`font-semibold text-sm ${color}`}>{value}</div>
    </div>
  );
}

function stateColor(s: string): string {
  if (s === 'GREEN') return 'text-green-400';
  if (s === 'YELLOW') return 'text-yellow-400';
  return 'text-red-400';
}