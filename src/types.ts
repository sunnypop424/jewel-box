export type RaidId =
  | 'ACT3_HARD'
  | 'ACT4_NORMAL'
  | 'ACT4_HARD'
  | 'FINAL_NORMAL'
  | 'FINAL_HARD';

export type Role = 'DPS' | 'SUPPORT';

export interface Character {
  id: string;
  discordName: string;
  jobCode: string;
  role: Role;
  itemLevel: number;
  combatPower: number;
}

export interface RaidRunParty {
  partyIndex: number;
  members: Character[];
}

export interface RaidRun {
  raidId: RaidId;
  runIndex: number;
  parties: RaidRunParty[];
  averageCombatPower: number;
}

export type RaidSchedule = Record<RaidId, RaidRun[]>;

// 레이드별로 제외된 캐릭터 id 목록
export type RaidExclusionMap = Partial<Record<RaidId, string[]>>;
