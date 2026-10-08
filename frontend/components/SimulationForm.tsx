'use client';

import { useState } from 'react';
import { Direction } from '@/lib/types';

interface Props {
  onSubmit: (payload: any) => Promise<void>;
  onControllerEvent: (payload: any) => Promise<void>;
}

const DIRECTIONS: Direction[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
const VEHICLE_TYPES = ['FORKLIFT', 'TRUCK', 'EMPLOYEE_VEHICLE', 'EMERGENCY'];

export default function SimulationForm({
  onSubmit,
  onControllerEvent,
}: Props) {
  const [direction, setDirection] = useState<Direction>('NORTH');
  const [vehicleType, setVehicleType] = useState('TRUCK');
  const [vehicleId, setVehicleId] = useState('VH-001');
  const [eventType, setEventType] = useState('VEHICLE_ARRIVED');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [cmdId, setCmdId] = useState('cmd-xxx');
  const [ackState, setAckState] = useState('GREEN');
  const [ackStatus, setAckStatus] = useState<'ACK' | 'NACK' | 'TIMEOUT'>('ACK');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const eventId = `evt-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
      await onSubmit({
        event_id: eventId,
        junction_id: 'A',
        direction,
        event_type: eventType,
        vehicle_id: vehicleId,
        vehicle_type:
          eventType === 'VEHICLE_ARRIVED' ? vehicleType : undefined,
        sequence_no: Math.floor(Date.now() / 1000),
      });
      setMsg('✅ Event submitted');
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleControllerAck(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await onControllerEvent({
        command_id: cmdId,
        junction_id: 'A',
        status: ackStatus,
        actual_state: ackStatus === 'ACK' ? ackState : undefined,
        direction,
      });
      setMsg('✅ Controller event submitted');
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-3">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">
          Simulate Sensor Event
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm col-span-2"
          >
            <option value="VEHICLE_ARRIVED">VEHICLE_ARRIVED</option>
            <option value="VEHICLE_CLEARED">VEHICLE_CLEARED</option>
          </select>

          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {eventType === 'VEHICLE_ARRIVED' && (
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}

          <input
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            placeholder="Vehicle ID"
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm col-span-2"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded px-3 py-2 text-sm font-medium transition"
        >
          {busy ? 'Submitting...' : 'Submit Sensor Event'}
        </button>
      </form>

      <form
        onSubmit={handleControllerAck}
        className="space-y-3 pt-4 border-t border-slate-800"
      >
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">
          Simulate Controller ACK
        </h3>

        <input
          value={cmdId}
          onChange={(e) => setCmdId(e.target.value)}
          placeholder="command_id (cmd-xxx)"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={ackStatus}
            onChange={(e) => setAckStatus(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
          >
            <option value="ACK">ACK</option>
            <option value="NACK">NACK</option>
            <option value="TIMEOUT">TIMEOUT</option>
          </select>

          <select
            value={ackState}
            onChange={(e) => setAckState(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
          >
            <option value="RED">RED</option>
            <option value="YELLOW">YELLOW</option>
            <option value="GREEN">GREEN</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded px-3 py-2 text-sm font-medium transition"
        >
          Submit Controller Event
        </button>
      </form>

      {msg && (
        <div className="text-xs text-slate-300 bg-slate-800 rounded px-2 py-1.5">
          {msg}
        </div>
      )}
    </div>
  );
}