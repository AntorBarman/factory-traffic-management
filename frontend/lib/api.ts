import { HistoryResponse, JunctionStatus } from './types';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getJunctionStatus(
  id: string
): Promise<JunctionStatus> {
  return apiFetch<JunctionStatus>(`/api/junctions/${id}/status`);
}

export async function getHistory(
  id: string,
  limit = 30
): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(
    `/api/junctions/${id}/history?limit=${limit}`
  );
}

export async function postSensorEvent(payload: {
  event_id: string;
  junction_id: string;
  direction: string;
  event_type: string;
  vehicle_id?: string;
  vehicle_type?: string;
  sequence_no?: number;
  timestamp?: string;
}): Promise<any> {
  return apiFetch(`/api/sensor-events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function postCommand(
  junctionId: string,
  command: string,
  direction?: string
): Promise<any> {
  return apiFetch(`/api/junctions/${junctionId}/commands`, {
    method: 'POST',
    body: JSON.stringify({ command, direction }),
  });
}

export async function postControllerEvent(payload: {
  command_id: string;
  junction_id: string;
  status: 'ACK' | 'NACK' | 'TIMEOUT';
  actual_state?: string;
  direction?: string;
}): Promise<any> {
  return apiFetch(`/api/controller-events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}