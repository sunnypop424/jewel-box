export type Role = 'DPS' | 'SUPPORT';

export type GoldOption = 'ALL_MAX' | 'GENERAL_MAX' | 'MAIN_ALL_ALT_GENERAL';

export type RaidId =
  | 'ACT2_HARD'     // 🌟 추가 (1690)
  | 'ACT3_HARD'     // 🌟 추가 (1700)
  | 'ACT4_NORMAL' // 1700
  | 'FINAL_NORMAL' // 1710
  | 'SERKA_NORMAL' // 1710 (4인)
  | 'ACT4_HARD' // 1720
  | 'FINAL_HARD' // 1730
  | 'SERKA_HARD' // 1730 (4인)
  | 'SERKA_NIGHTMARE' // 1740 (4인)
  | 'HORIZON_STEP1' // 1700
  | 'HORIZON_STEP2' // 1720
  | 'HORIZON_STEP3'; // 1750

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

  goldOption?: GoldOption;
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

// ✅ [NEW] 교체(Swap) 정보 타입 추가
export interface RaidSwap {
  raidId: string;
  charId1: string;
  charId2: string;
  timestamp?: string;
}