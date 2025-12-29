export type Role = 'DPS' | 'SUPPORT';

export type RaidId =
  | 'ACT3_HARD' // 1700
  | 'ACT4_NORMAL' // 1700
  | 'FINAL_NORMAL' // 1710
  | 'SERKA_NORMAL' // 1710 (4인)
  | 'ACT4_HARD' // 1720
  | 'FINAL_HARD' // 1730
  | 'SERKA_HARD' // 1730 (4인)
  | 'SERKA_NIGHTMARE'; // 1740 (4인)

export type Character = {
  id: string;
  discordName: string;
  jobCode: string;
  role: Role;
  itemLevel: number;
  combatPower: number;

  /** 1740+일 때 세르카 나이트메어 갈지(기본 false로 UI에서 관리) */
  serkaNightmare?: boolean;

  /** 발키 “서폿 가능(플렉스)” 체크 (기본 false) */
  valkyCanSupport?: boolean;
};

export type RaidRunParty = {
  partyIndex: number; // 1..N
  members: Character[];
};

export type RaidRun = {
  raidId: RaidId;
  runIndex: number; // 1..N
  parties: RaidRunParty[];
  averageCombatPower: number;
};

export type RaidSchedule = Record<RaidId, RaidRun[]>;

export type RaidExclusionMap = Partial<Record<RaidId, string[]>>;

/** 레이드별 랏폿 설정 (true면: 발키 플렉스를 서폿으로 승격할 수 있음) */
export type RaidSettingsMap = Partial<Record<RaidId, boolean>>;
