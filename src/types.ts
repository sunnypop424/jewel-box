export type Role = 'DPS' | 'SUPPORT';

export type GoldOption = 'ALL_MAX' | 'GENERAL_MAX' | 'MAIN_ALL_ALT_GENERAL' | 'CUSTOM';

export type RaidId = 
  | 'ACT1_HARD' 
  | 'ACT2_NORMAL' | 'ACT2_HARD' 
  | 'ACT3_NORMAL' | 'ACT3_HARD' 
  | 'ACT4_NORMAL' | 'ACT4_HARD' 
  | 'FINAL_NORMAL' | 'FINAL_HARD' 
  | 'SERKA_NORMAL' | 'SERKA_HARD' | 'SERKA_NIGHTMARE'
  | 'HORIZON_STEP1' | 'HORIZON_STEP2' | 'HORIZON_STEP3';

// 싱글 모드 저장용 타입 추가
export type RaidSingleMap = Partial<Record<RaidId, string[]>>; // RaidId별 싱글로 클리어한 캐릭터 ID 배열

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

  /** 귀속 골드 여부 **/
  receiveBoundGold?: boolean;

  goldOption?: GoldOption;
  lostArkName?: string;
  singleRaids?: RaidId[];
  isParticipating?: boolean;

  // 게스트 필드 추가
  isGuest?: boolean;
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