'use client';

import { Direction, SignalState } from '@/lib/types';

const COLORS: Record<SignalState, string> = {
  RED: 'bg-red-500',
  YELLOW: 'bg-yellow-400',
  GREEN: 'bg-green-500',
};

const DIM: Record<SignalState, string> = {
  RED: 'bg-red-900/40',
  YELLOW: 'bg-yellow-900/40',
  GREEN: 'bg-green-900/40',
};

interface Props {
  signals: Record<Direction, SignalState>;
  queues: Record<Direction, number>;
  active: Direction[];
}

function Light({ state, active }: { state: SignalState; active: boolean }) {
  return (
    <div
      className={`w-7 h-7 rounded-full transition-all ${
        active ? COLORS[state] : DIM[state]
      } ${active ? 'shadow-lg' : ''}`}
    />
  );
}

function Arm({
  direction,
  state,
  queue,
  active,
}: {
  direction: Direction;
  state: SignalState;
  queue: number;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex flex-col gap-1 p-1.5 rounded-lg bg-slate-800 border border-slate-700">
        <Light state="RED" active={active && state === 'RED'} />
        <Light state="YELLOW" active={active && state === 'YELLOW'} />
        <Light state="GREEN" active={active && state === 'GREEN'} />
      </div>
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          {direction}
        </div>
        <div className="text-sm font-semibold text-slate-100">{queue}</div>
      </div>
    </div>
  );
}

export default function Intersection({ signals, queues, active }: Props) {
  const isActive = (d: Direction) => active.includes(d);

  return (
    <div className="relative w-full aspect-square max-w-md mx-auto bg-slate-900 rounded-2xl border border-slate-700">
      {/* North */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2">
        <Arm
          direction="NORTH"
          state={signals.NORTH}
          queue={queues.NORTH}
          active={isActive('NORTH')}
        />
      </div>

      {/* South */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <Arm
          direction="SOUTH"
          state={signals.SOUTH}
          queue={queues.SOUTH}
          active={isActive('SOUTH')}
        />
      </div>

      {/* West */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <Arm
          direction="WEST"
          state={signals.WEST}
          queue={queues.WEST}
          active={isActive('WEST')}
        />
      </div>

      {/* East */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2">
        <Arm
          direction="EAST"
          state={signals.EAST}
          queue={queues.EAST}
          active={isActive('EAST')}
        />
      </div>

      {/* Center label */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-600 text-[10px] font-mono">
        JUNCTION A
      </div>
    </div>
  );
}