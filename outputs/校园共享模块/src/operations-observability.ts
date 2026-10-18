/** Ephemeral, aggregate operations data. No browsing paths or world positions. */
export interface PresenceHeartbeat {
  sessionId?: string;
  client: 'web' | 'native';
  active: boolean;
}
export interface PresenceReceipt {
  sessionId: string;
  heartbeatSeconds: 30;
  expiresInSeconds: 90;
}
export type RoomCommandState = 'queued' | 'executing' | 'executed' | 'noop' | 'failed' | 'expired';
export interface RoomMemberStatus {
  playerId: string;
  nickname: string;
  connected: boolean;
  ready: boolean;
  loading: boolean;
  team: string | number | null;
}
export interface PresenceSummary {
  checkedAt: number;
  recovering: boolean;
  recoveryUntil: number;
  activeAccounts: number;
  guestSessions: number;
  clientSessions: number;
  webSessions: number;
  nativeSessions: number;
  multiplayerConnected: number;
  reservedSeats: number;
}
