'use client';

import { Direction } from '@/lib/types';

interface Props {
  onManualRequest: (direction: Direction) => void;
  onReturnToAuto: () => void;
  disabled?: boolean;
  mode: string;
}

const DIRECTIONS: Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

export default function ManualControl({
  onManualRequest,
  onReturnToAuto,
  disabled,
  mode,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase text-slate-400">Current mode:</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            mode === 'AUTOMATIC'
              ? 'bg-green-900/40 text-green-300'
              : mode === 'MANUAL'
              ? 'bg-yellow-900/40 text-yellow-300'
              : mode === 'EMERGENCY'
              ? 'bg-red-900/40 text-red-300'
              : 'bg-slate-700 text-slate-300'
          }`}
        >
          {mode}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {DIRECTIONS.map((d) => (
          <button
            key={d}
            onClick={() => onManualRequest(d)}
            disabled={disabled}
            className="px-3 py-2 text-sm rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition"
          >
            Manual GREEN: {d}
          </button>
        ))}
      </div>

      <button
        onClick={onReturnToAuto}
        disabled={disabled || mode === 'AUTOMATIC'}
        className="w-full px-3 py-2 text-sm rounded bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 disabled:opacity-40 disabled:cursor-not-allowed border border-blue-800 transition"
      >
        Return to AUTOMATIC
      </button>
    </div>
  );
}