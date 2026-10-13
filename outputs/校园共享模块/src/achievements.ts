export type AchievementMode = 'escape' | 'coop' | 'pvp' | 'dafei';
export type AchievementSource = 'validated' | 'authoritative';
export interface AchievementEvidence {
  mode: AchievementMode; won: boolean; elapsed: number; score?: number;
  difficulty?: 'easy' | 'standard' | 'hard'; variant?: 'tdm' | 'ffa'; playerCount?: number;
  kills?: number; deaths?: number; assists?: number; downs?: number; uniqueDowns?: number;
  headshots?: number; damage?: number; rank?: number; transmission?: 'auto' | 'manual' | 'mixed';
  revives?: number; repairCount?: number; resetCount?: number; hits?: number; bestCombo?: number;
}
export interface AchievementDefinition {
  id: string; mode: AchievementMode; title: string; description: string;
  source: AchievementSource; icon: string; test: (value: AchievementEvidence) => boolean;
}
export interface AchievementUnlock { id: string; unlockedAt: number | null; unlocked?: boolean; source?: AchievementSource; sourceId?: string | null; progress?: {current: number | null; target: number; unit: string}; }
const atLeast = (value: number | undefined, target: number) => typeof value === 'number' && Number.isFinite(value) && value >= target;
const zero = (value: number | undefined) => value === 0;
const completeDrive = (value: AchievementEvidence) => value.elapsed >= 300 - 1 / 60;
function entry(id: string, mode: AchievementMode, title: string, description: string, test: AchievementDefinition['test']): AchievementDefinition {
  return Object.freeze({id, mode, title, description, source: mode === 'coop' || mode === 'pvp' ? 'authoritative' : 'validated', icon: `/assets/achievements/${id}.webp`, test});
}
/** One canonical catalogue for UI, settlement and history backfill. Unknown legacy fields never count as zero. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = Object.freeze([
  entry('solo-first', 'escape', '走出校园', '首次成功完成单人突围。', v => v.won),
  entry('solo-hard', 'escape', '迎难而行', '在挑战难度成功撤离。', v => v.won && v.difficulty === 'hard'),
  entry('solo-s', 'escape', '出色的计划', '成功撤离并获得至少85分。', v => v.won && atLeast(v.score, 85)),
  entry('solo-clean', 'escape', '毫发无伤', '累计承伤为零并成功撤离。', v => v.won && zero(v.damage)),
  entry('solo-six', 'escape', '逐个突破', '单局击倒六名不同追兵。', v => atLeast(v.uniqueDowns, 6)),
  entry('solo-headshots', 'escape', '稳住准星', '单局完成三次爆头击倒。', v => atLeast(v.headshots, 3)),
  entry('coop-first', 'coop', '一起回去', '首次完成合作突围并撤离。', v => v.won),
  entry('coop-four', 'coop', '一个都不少', '四人队伍共同成功撤离。', v => v.won && v.playerCount === 4),
  entry('coop-hard', 'coop', '并肩迎难', '完成挑战难度的合作突围。', v => v.won && v.difficulty === 'hard'),
  entry('coop-s', 'coop', '默契成章', '合作撤离并获得至少85分。', v => v.won && atLeast(v.score, 85)),
  entry('coop-clean', 'coop', '可靠的同行者', '本人未倒下并完成合作撤离。', v => v.won && zero(v.deaths)),
  entry('coop-rescue', 'coop', '伸出援手', '在合作突围中成功救起一名队友。', v => atLeast(v.revives, 1)),
  entry('pvp-tdm', 'pvp', '共同的胜利', '赢得一局团队对战。', v => v.won && v.variant === 'tdm'),
  entry('pvp-ffa', 'pvp', '站到最后', '在个人混战中获得第一名（含并列）。', v => v.won && v.rank === 1 && v.variant === 'ffa'),
  entry('pvp-ten', 'pvp', '势不可挡', '单局完成十次击倒。', v => atLeast(v.kills, 10)),
  entry('pvp-assist', 'pvp', '助攻时刻', '单局完成三次助攻。', v => atLeast(v.assists, 3)),
  entry('pvp-headshots', 'pvp', '精准终结', '单局完成三次爆头击倒。', v => atLeast(v.headshots, 3)),
  entry('pvp-clean', 'pvp', '游刃有余', '单局至少五次击倒且零次倒下。', v => atLeast(v.kills, 5) && zero(v.deaths)),
  entry('drive-finish', 'dafei', '五分钟的旅程', '在大飞模式中坚持完整300秒。', completeDrive),
  entry('drive-twenty', 'dafei', '行动不止', '单局完成二十次有效撞飞。', v => atLeast(v.hits, 20)),
  entry('drive-combo', 'dafei', '一气呵成', '在大飞模式中达成四倍连击。', v => atLeast(v.bestCombo, 4)),
  entry('drive-manual', 'dafei', '掌握节奏', '全程手动挡并坚持完整300秒。', v => completeDrive(v) && v.transmission === 'manual'),
  entry('drive-repair', 'dafei', '整装再出发', '单局完成两次有效维修。', v => atLeast(v.repairCount, 2)),
  entry('drive-clean', 'dafei', '一路向前', '未经脱困或安全恢复，坚持完整300秒。', v => completeDrive(v) && zero(v.resetCount)),
]);
export const ACHIEVEMENT_CATALOG = ACHIEVEMENTS;
export const achievementById = (id: string) => ACHIEVEMENTS.find(value => value.id === id);
export function eligibleAchievementIds(evidence: AchievementEvidence): string[] {
  return ACHIEVEMENTS.filter(value => value.mode === evidence.mode && value.test(evidence)).map(value => value.id);
}
