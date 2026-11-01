import type { RankingPlayer, RankingSubmission } from './ranking.ts';
import type { AchievementMode, AchievementUnlock } from './achievements.ts';

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export function validNewPasswordLength(value: unknown): value is string {
  return typeof value === 'string' && [...value].length >= PASSWORD_MIN_LENGTH && [...value].length <= PASSWORD_MAX_LENGTH;
}

export type AccountStatus = 'legacy' | 'active' | 'disabled';
export type AvatarId = 'initials' | 'preset-1' | 'preset-2' | 'preset-3' | 'preset-4' | 'preset-5' | 'preset-6' | 'preset-7' | 'preset-8';
export interface AccountAvatarImage { revision:string; url:string; thumbnailUrl:string; width:number; height:number; authenticated?:boolean; }
export interface AccountAppearance { playerId:string; avatar:AvatarId; avatarImage?:AccountAvatarImage; }
export interface AccountMatch { id:string; source:'solo'|'multiplayer'; mode:string; status:string; submittedAt:number; summary:Record<string,unknown>|null; published:boolean; difficulty?:string; vehicleId?:string; ruleVersion?:string; runId?:string; canPublish:boolean; }
export interface AccountMatchPage { items:AccountMatch[]; nextCursor?:string|null; }
export interface AccountPlayer extends RankingPlayer { accountStatus?: AccountStatus; needsUpgrade?: boolean; username?: string; }
export interface AccountDetails {
  id?: string; updatedAt?: number;
  username: string; avatar: AvatarId; avatarImage?:AccountAvatarImage; publicProfile: boolean; syncStats: boolean;
  featuredAchievements: string[]; createdAt?: number; status?: AccountStatus;
}
export interface AccountIdentity { player: AccountPlayer; account: AccountDetails | null; }
export interface AccountAuth extends AccountIdentity { token: string; expiresAt: number; recoveryCode?: string; }
export interface AccountModeStats {
  mode?: AchievementMode; matches?: number; wins?: number | null; elapsed?: number; kills?: number;
  deaths?: number; assists?: number; downs?: number; headshots?: number; damage?: number;
  hits?: number; bestCombo?: number; bestScore?: number; bestElapsed?: number;
  revives?: number; repairCount?: number; resetCount?: number;
  totalKills?: number | null; totalDeaths?: number | null; totalAssists?: number | null;
  totalHeadshots?: number | null; totalRevives?: number | null; totalHits?: number | null; totalCannonHits?: number | null;
  totalRepairs?: number | null; totalResets?: number | null;
  totalElapsed?:number|null; totalDamage?:number|null; totalDowns?:number|null;
  totalUniqueDowns?:number|null; totalCompleted?:number|null; winsKnownMatches?:number;
}
export interface AccountProfile extends AccountIdentity {
  stats: Partial<Record<AchievementMode, AccountModeStats>>;
  recent: (RankingSubmission | Record<string, unknown>)[];
  achievements: AchievementUnlock[]; featuredAchievements: (string | AchievementUnlock)[];
  bestByRule?: {mode: string; difficulty?: string; vehicleId?: import('./ranking.ts').DrivingVehicleId; ruleVersion: string; bestScore: number; matches?: number}[];
}
export interface AccountSession { id: string; current: boolean; createdAt?: number; expiresAt: number; lastSeenAt?: number; label?: string; }
export interface AccountAppeal { id: string; receiptCode?: string; status?: string; message?: string; response?: string; resetCode?: string; expiresAt?: number; legacy?: boolean; replies?: {message: string; createdAt: number}[]; createdAt?: number; }
export interface FeedbackAssociation { id: string; receiptCode: string; }
export interface PublicAccountProfile {
  player: Pick<AccountPlayer, 'nickname' | 'shortId' | 'id'>;
  avatar?: AvatarId; avatarImage?:AccountAvatarImage; featuredAchievements: (string | AchievementUnlock)[];
  publicBoardSummary?: {mode: string; difficulty?: string; vehicleId?: import('./ranking.ts').DrivingVehicleId; ruleVersion?: string; bestScore?: number; matches?: number}[];
}
export function isActiveAccount(player: AccountPlayer | null | undefined): boolean { return !!player && player.accountStatus === 'active'; }
export function needsAccountUpgrade(player: AccountPlayer | null | undefined): boolean { return !!player && (player.accountStatus === 'legacy' || player.needsUpgrade === true); }
