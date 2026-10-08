export type Direction = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
export type SignalState = 'RED' | 'YELLOW' | 'GREEN';

export interface JunctionStatus {
  junction_id: string;
  mode: 'AUTOMATIC' | 'MANUAL' | 'EMERGENCY' | 'DEGRADED';
  phase: 'NORTH_SOUTH' | 'EAST_WEST' | 'ALL_RED';
  controller_status:
    | 'ONLINE'
    | 'OFFLINE'
    | 'DEGRADED'
    | 'WARNING'
    | 'UNKNOWN';
  desired_signals: Record<Direction, SignalState>;
  actual_signals: Record<Direction, SignalState>;
  emergency_active: boolean;
  emergency_direction: Direction | null;
  manual_override: boolean;
  queues: Record<Direction, number>;
  pending_command: {
    command_id: string;
    requested_state: SignalState;
    status: string;
    created_at: string;
  } | null;
}

export interface AuditLog {
  id: string;
  junctionId: string;
  eventType: string;
  direction: string | null;
  previousState: string | null;
  newState: string | null;
  commandId: string | null;
  metadata: any;
  createdAt: string;
}

export interface HistoryResponse {
  junction_id: string;
  count: number;
  logs: AuditLog[];
}