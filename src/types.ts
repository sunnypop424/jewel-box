export type Role = 'DPS' | 'SUPPORT';

export type GoldOption = 'ALL_MAX' | 'GENERAL_MAX' | 'MAIN_ALL_ALT_GENERAL' | 'CUSTOM';

// RaidId 는 레이드 레지스트리에서 관리. 기존 import 경로 호환을 위해 재수출.
export type { RaidId, RosterRaidSelection, RosterRaidState } from './data/raids';
import type { RaidId } from './data/raids';

// 싱글 모드 저장용 타입 추가
export type RaidSingleMap = Partial<Record<RaidId, string[]>>; // RaidId별 싱글로 클리어한 캐릭터 ID 배열

export type Character = {
  id: string;
  discordName: string;
  discordId?: string;
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

  // 원정대 — 한 유저가 여러 원정대를 키우는 경우 식별.
  // 기본값(누락 시) = discordName. 소비자 코드에서 `ch.rosterId ?? ch.discordName` 으로 읽기.
  rosterId?: string;
  rosterLabel?: string;    // 표시용 ('본계', '부계' 등). 미지정시 기본 원정대로 간주.
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

// 주간 클리어 원장 (Ledger) — 클리어 시점 골드 스냅샷을 저장.
// 키: 캐릭터 ID → 레이드 ID → 엔트리. 캐릭의 아이템 레벨이 바뀌어도 과거 골드가 보존됨.
export interface ClearEntry {
  raidId: RaidId;
  clearedAt: string;              // ISO 8601 timestamp
  clearedItemLevel: number;       // 감사용 (어떤 레벨에서 클리어했는지)
  generalGold: number;            // 스냅샷 (거래가능)
  boundGold: number;              // 스냅샷 (귀속)
}

// Firestore: raidData/clears 단일 문서. 구조: { [charId]: { [raidId]: ClearEntry } }
export type WeeklyClears = Record<string, Partial<Record<RaidId, ClearEntry>>>;

/** 레이드별 랏폿 설정 (true면: 발키 플렉스를 서폿으로 승격할 수 있음) */
export type RaidSettingsMap = Partial<Record<RaidId, boolean>>;

// ✅ [NEW] 교체(Swap) 정보 타입 추가
export interface RaidSwap {
  raidId: string;
  charId1: string;
  charId2: string;
  timestamp?: string;
}

// 미션 보드 (Jewel Bet) — 공대원 간 골드 미션 트래킹.
// 누적 골드 시스템과는 분리. 시스템이 골드를 옮기지 않고 송금/수령 체크박스로만 추적.
export type MissionType = 'DIRECT' | 'POOL_LUCK' | 'POOL_COMPETE';

export type MissionStatus =
  | 'OPEN'        // 진행 중 (판정 대기)
  | 'RESOLVING'   // 성공 판정 후 수령자 결정 중
  | 'SETTLED'     // 수령자 확정, 정산 트래킹 중
  | 'COMPLETED'   // 송금+수령 모두 체크
  | 'FAILED'      // 미션 실패
  | 'VOIDED';     // 무효 (사유 필수)

export type PoolLuckRule = 'RANDOM' | 'LOWEST_HP' | 'MAIN_MVP' | 'CUSTOM';

export type CompeteCriterion = 'TOP_DPS' | 'CUSTOM';

export type WinnerSelectedBy = 'AUTO' | 'ROULETTE' | 'ISSUER_PICK';

export interface Mission {
  id: string;                            // Firestore doc id
  issuer: string;                        // 미션 건 사람 (UI에서 직접 선택)
  type: MissionType;
  title: string;
  goldAmount: number;                    // 양수
  description?: string;

  target?: string;                       // DIRECT 전용 (단일 이름)
  poolMembers?: string[];                // POOL_* 전용 (자유 입력 후보군)

  poolLuckRule?: PoolLuckRule;           // POOL_LUCK 전용
  competeCriterion?: CompeteCriterion;   // POOL_COMPETE 전용
  customCriterion?: string;              // CUSTOM 시 라벨

  status: MissionStatus;
  winner?: string;
  winnerSelectedBy?: WinnerSelectedBy;
  voidReason?: string;

  paidByIssuer?: boolean;
  receivedByWinner?: boolean;

  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  completedAt?: string;
  discordMessageId?: string;             // SETTLED 알림 메시지 ID (정산 완료 시 삭제용)
}

// 미션 생성 시 입력 받는 필드. 상태/타임스탬프/체크박스 필드는 createMission이 자동 채움.
export type NewMission = Omit<
  Mission,
  | 'id'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'winner'
  | 'winnerSelectedBy'
  | 'paidByIssuer'
  | 'receivedByWinner'
  | 'resolvedAt'
  | 'completedAt'
  | 'discordMessageId'
  | 'voidReason'
>;