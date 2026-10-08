'use client';

import { AuditLog } from '@/lib/types';

interface Props {
  logs: AuditLog[];
}

const BADGE_COLOR: Record<string, string> = {
  VEHICLE_DETECTED: 'bg-blue-900/40 text-blue-300',
  VEHICLE_CLEARED: 'bg-cyan-900/40 text-cyan-300',
  DUPLICATE_SENSOR_EVENT: 'bg-slate-700 text-slate-300',
  CLEARED_WITHOUT_ARRIVAL: 'bg-orange-900/40 text-orange-300',
  EMERGENCY_DETECTED: 'bg-red-900/40 text-red-300',
  EMERGENCY_CLEARED: 'bg-green-900/40 text-green-300',
  MANUAL_OVERRIDE: 'bg-yellow-900/40 text-yellow-300',
  RETURN_TO_AUTOMATIC: 'bg-green-900/40 text-green-300',
  SIGNAL_TRANSITION_STARTED: 'bg-indigo-900/40 text-indigo-300',
  CONTROLLER_ACK: 'bg-emerald-900/40 text-emerald-300',
  CONTROLLER_TIMEOUT: 'bg-red-900/40 text-red-300',
  CONTROLLER_NACK: 'bg-red-900/40 text-red-300',
};

export default function RecentActivity({ logs }: Props) {
  if (!logs.length) {
    return (
      <div className="text-sm text-slate-500 italic">
        No activity yet. Simulate an event to see logs.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-start gap-3 p-2 rounded bg-slate-900/60 border border-slate-800"
        >
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${
              BADGE_COLOR[log.eventType] ?? 'bg-slate-700 text-slate-300'
            }`}
          >
            {log.eventType}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-400">
              {new Date(log.createdAt).toLocaleTimeString()}
              {log.direction && ` · ${log.direction}`}
            </div>
            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <div className="text-[11px] text-slate-500 truncate font-mono">
                {JSON.stringify(log.metadata)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}