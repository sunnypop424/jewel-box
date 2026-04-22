// =============================================================================
// 레이드 단일 레지스트리
// -----------------------------------------------------------------------------
// 모든 레이드 메타데이터(레이블, 레벨제한, 골드, 난이도, 인원수, 싱글모드,
// 기간 제한, 원정대/캐릭터 스코프 등)를 이 한 파일에서 관리합니다.
// 새 레이드/난이도 추가 시 RAIDS 배열에 객체만 추가하면 RaidId 타입·
// RAID_META·getEligibleRaids·인원 배치 설정 등 파생물이 자동으로 반영됩니다.
//
// 골드 정책 (2026-04-22 수요일 패치 이후):
//   - minItemLevel > 1710 레이드: 100% 거래가능 (generalGold only)
//   - minItemLevel ≤ 1710 레이드: 50% 거래가능 + 50% 귀속으로 분할
//   - HORIZON: 귀속 전용 (변경 없음)
//
// 싱글모드:
//   - 패치 후 ACT2/ACT3 의 싱글모드는 일반 모드와 동일해져 플래그를 전부 내림.
//   - 인프라(singleModeAvailable, isSingleForRaid 등)는 유지 — 향후 다른
//     레이드가 싱글모드를 추가하면 해당 난이도에 true 로 설정.
// =============================================================================

// -----------------------------------------------------------------------------
// 기본 타입
// -----------------------------------------------------------------------------

export type RaidFamily =
  | 'ACT1'
  | 'ACT2'
  | 'ACT3'
  | 'ACT4'
  | 'FINAL'
  | 'SERKA'
  | 'HORIZON'
  | 'KAZEROS';

export type DifficultyTier =
  | 'NORMAL'
  | 'HARD'
  | 'NIGHTMARE'
  | 'SINGLE'
  | 'STEP1'
  | 'STEP2'
  | 'STEP3';

// 저장/직렬화 포맷은 기존과 호환되는 언더스코어 유지 (예: 'SERKA_HARD').
// 내부 조회는 family/tier 로 분해해서 수행.
export type RaidId =
  | 'ACT1_HARD'
  | 'ACT1_SINGLE'
  | 'ACT2_NORMAL'
  | 'ACT2_HARD'
  | 'ACT2_SINGLE'
  | 'ACT3_NORMAL'
  | 'ACT3_HARD'
  | 'ACT3_SINGLE'
  | 'ACT4_NORMAL'
  | 'ACT4_HARD'
  | 'FINAL_NORMAL'
  | 'FINAL_HARD'
  | 'SERKA_NORMAL'
  | 'SERKA_HARD'
  | 'SERKA_NIGHTMARE'
  | 'HORIZON_STEP1'
  | 'HORIZON_STEP2'
  | 'HORIZON_STEP3'
  | 'KAZEROS_NORMAL'
  | 'KAZEROS_HARD'
  | 'KAZEROS_NIGHTMARE';

export type GoldType = 'GENERAL' | 'BOUND';
export type ClearScope = 'character' | 'roster';
export type ResetPolicy = 'weekly' | 'event' | 'none';

// 난이도 해금에 필요한 캐릭터 boolean 플래그명 (신규 추가 시 확장)
export type RequiresFlag = 'serkaNightmare';

// getEligibleRaids 가 캐릭터에서 참조하는 최소 필드 (Character import 회피)
export interface EligibilityContext {
  itemLevel: number;
  serkaNightmare?: boolean;
  singleRaids?: RaidId[];
}

// -----------------------------------------------------------------------------
// 정의 스키마
// -----------------------------------------------------------------------------

export interface DifficultyDef {
  tier: DifficultyTier;
  label: string;                       // '노말', '하드', '나이트메어', '1단계'
  minItemLevel: number;
  generalGold: number;                 // 거래가능 골드
  boundGold: number;                   // 귀속 골드
  colorClass: string;
  singleModeAvailable?: boolean;
  requiresFlag?: RequiresFlag;
}

export interface RaidDefinition {
  family: RaidFamily;
  label: string;                        // '세르카', '지평의 성당'
  order: number;                        // top3 선정 우선순위 (낮을수록 우선)
  clearScope: ClearScope;
  resetPolicy: ResetPolicy;
  includeInGoldTop3: boolean;
  exclusiveDifficulty: boolean;
  partySize: 4 | 8;                     // ⭐ 인원 배치 스크립트가 직접 참조
  availableFrom?: string;               // ISO YYYY-MM-DD (KST)
  availableUntil?: string;              // ISO YYYY-MM-DD (KST)
  difficulties: DifficultyDef[];
}

// -----------------------------------------------------------------------------
// 레이드 레지스트리
// -----------------------------------------------------------------------------

export const RAIDS: RaidDefinition[] = [
  {
    family: 'HORIZON',
    label: '지평의 성당',
    order: 0,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 4,
    difficulties: [
      { tier: 'STEP1', label: '1단계', minItemLevel: 1700, generalGold: 0, boundGold: 30000, colorClass: 'bg-orange-400' },
      { tier: 'STEP2', label: '2단계', minItemLevel: 1720, generalGold: 0, boundGold: 40000, colorClass: 'bg-orange-500' },
      { tier: 'STEP3', label: '3단계', minItemLevel: 1750, generalGold: 0, boundGold: 50000, colorClass: 'bg-orange-600' },
    ],
  },
  {
    // 카제로스 익스트림 — 원정대당 1회. 2026-04-22(수)부터 8주간 운영.
    family: 'KAZEROS',
    label: '카제로스 익스트림',
    order: 1,
    clearScope: 'roster',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 8,
    availableFrom: '2026-04-22',
    availableUntil: '2026-06-16',
    difficulties: [
      { tier: 'NORMAL', label: '노말', minItemLevel: 1720, generalGold: 20000, boundGold: 0, colorClass: 'bg-pink-400' },
      { tier: 'HARD', label: '하드', minItemLevel: 1750, generalGold: 45000, boundGold: 0, colorClass: 'bg-pink-600' },
      { tier: 'NIGHTMARE', label: '나이트메어', minItemLevel: 1770, generalGold: 45000, boundGold: 0, colorClass: 'bg-pink-800' },
    ],
  },
  {
    family: 'SERKA',
    label: '세르카',
    order: 2,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 4,
    difficulties: [
      { tier: 'NORMAL', label: '노말', minItemLevel: 1710, generalGold: 17500, boundGold: 17500, colorClass: 'bg-violet-300' },
      { tier: 'HARD', label: '하드', minItemLevel: 1730, generalGold: 44000, boundGold: 0, colorClass: 'bg-violet-500' },
      { tier: 'NIGHTMARE', label: '나이트메어', minItemLevel: 1740, generalGold: 54000, boundGold: 0, colorClass: 'bg-violet-700', requiresFlag: 'serkaNightmare' },
    ],
  },
  {
    family: 'FINAL',
    label: '종막',
    order: 3,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 8,
    difficulties: [
      { tier: 'NORMAL', label: '노말', minItemLevel: 1710, generalGold: 20000, boundGold: 20000, colorClass: 'bg-emerald-400' },
      { tier: 'HARD', label: '하드', minItemLevel: 1730, generalGold: 52000, boundGold: 0, colorClass: 'bg-red-500' },
    ],
  },
  {
    family: 'ACT4',
    label: '4막',
    order: 4,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 8,
    difficulties: [
      { tier: 'NORMAL', label: '노말', minItemLevel: 1700, generalGold: 16500, boundGold: 16500, colorClass: 'bg-sky-400' },
      { tier: 'HARD', label: '하드', minItemLevel: 1720, generalGold: 42000, boundGold: 0, colorClass: 'bg-amber-500' },
    ],
  },
  {
    family: 'ACT3',
    label: '3막',
    order: 5,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 8,
    difficulties: [
      { tier: 'NORMAL', label: '노말', minItemLevel: 1680, generalGold: 10500, boundGold: 10500, colorClass: 'bg-sky-400' },
      { tier: 'HARD', label: '하드', minItemLevel: 1700, generalGold: 13500, boundGold: 13500, colorClass: 'bg-orange-400' },
      { tier: 'SINGLE', label: '싱글', minItemLevel: 1680, generalGold: 10500, boundGold: 10500, colorClass: 'bg-violet-400' },
    ],
  },
  {
    family: 'ACT2',
    label: '2막',
    order: 6,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 8,
    difficulties: [
      { tier: 'NORMAL', label: '노말', minItemLevel: 1670, generalGold: 8250, boundGold: 8250, colorClass: 'bg-sky-400' },
      { tier: 'HARD', label: '하드', minItemLevel: 1690, generalGold: 11500, boundGold: 11500, colorClass: 'bg-amber-600' },
      { tier: 'SINGLE', label: '싱글', minItemLevel: 1670, generalGold: 8250, boundGold: 8250, colorClass: 'bg-violet-400' },
    ],
  },
  {
    family: 'ACT1',
    label: '1막',
    order: 7,
    clearScope: 'character',
    resetPolicy: 'weekly',
    includeInGoldTop3: true,
    exclusiveDifficulty: true,
    partySize: 8,
    difficulties: [
      { tier: 'HARD', label: '하드', minItemLevel: 1680, generalGold: 9000, boundGold: 9000, colorClass: 'bg-amber-500' },
      { tier: 'SINGLE', label: '싱글', minItemLevel: 1660, generalGold: 5750, boundGold: 5750, colorClass: 'bg-violet-400' },
    ],
  },
];

// -----------------------------------------------------------------------------
// 직렬화 / 파싱
// -----------------------------------------------------------------------------

function encodeRaidId(family: RaidFamily, tier: DifficultyTier): RaidId {
  return `${family}_${tier}` as RaidId;
}

export function parseRaidId(raidId: RaidId): { family: RaidFamily; tier: DifficultyTier } {
  const idx = raidId.indexOf('_');
  return {
    family: raidId.slice(0, idx) as RaidFamily,
    tier: raidId.slice(idx + 1) as DifficultyTier,
  };
}

export function getRaidFamily(raidId: RaidId): RaidFamily {
  return raidId.slice(0, raidId.indexOf('_')) as RaidFamily;
}

// -----------------------------------------------------------------------------
// 인덱스 (O(1) 조회용 파생 캐시)
// -----------------------------------------------------------------------------

const RAID_BY_FAMILY: Record<RaidFamily, RaidDefinition> = RAIDS.reduce(
  (acc, r) => {
    acc[r.family] = r;
    return acc;
  },
  {} as Record<RaidFamily, RaidDefinition>
);

const DIFFICULTY_BY_RAID_ID: Partial<Record<RaidId, DifficultyDef>> = (() => {
  const map: Partial<Record<RaidId, DifficultyDef>> = {};
  for (const raid of RAIDS) {
    for (const diff of raid.difficulties) {
      map[encodeRaidId(raid.family, diff.tier)] = diff;
    }
  }
  return map;
})();

export function getRaidDefinition(family: RaidFamily): RaidDefinition {
  return RAID_BY_FAMILY[family];
}

export function getDifficultyForId(raidId: RaidId): DifficultyDef {
  const d = DIFFICULTY_BY_RAID_ID[raidId];
  if (!d) throw new Error(`Unknown raidId: ${raidId}`);
  return d;
}

// -----------------------------------------------------------------------------
// 파생 상수 — 기존 RAID_META / RAID_ORDER_FOR_PROGRESS 와 동일한 모양
// -----------------------------------------------------------------------------

export interface RaidMetaEntry {
  label: string;
  difficulty: DifficultyTier;
  colorClass: string;
  generalGold: number;
  boundGold: number;
  gold: number;                        // 파생: generalGold + boundGold
  goldType: GoldType;                  // 파생: 하위 호환용
  family: RaidFamily;
  partySize: 4 | 8;                    // 배치 스크립트가 직접 참조
  minItemLevel: number;
}

export const RAID_META: Record<RaidId, RaidMetaEntry> = (() => {
  const meta = {} as Record<RaidId, RaidMetaEntry>;
  for (const raid of RAIDS) {
    for (const diff of raid.difficulties) {
      const id = encodeRaidId(raid.family, diff.tier);
      meta[id] = {
        label: `${raid.label} ${diff.label}`,
        difficulty: diff.tier,
        colorClass: diff.colorClass,
        generalGold: diff.generalGold,
        boundGold: diff.boundGold,
        gold: diff.generalGold + diff.boundGold,
        goldType: diff.generalGold === 0 ? 'BOUND' : 'GENERAL',
        family: raid.family,
        partySize: raid.partySize,
        minItemLevel: diff.minItemLevel,
      };
    }
  }
  return meta;
})();

// UI 표시 및 진행률 집계용 레이드 순서.
export const RAID_ORDER_FOR_PROGRESS: RaidId[] = [
  'ACT1_HARD', 'ACT2_NORMAL', 'ACT3_NORMAL',
  'ACT2_HARD', 'ACT3_HARD',
  'ACT4_NORMAL', 'FINAL_NORMAL', 'SERKA_NORMAL',
  'ACT4_HARD', 'FINAL_HARD', 'SERKA_HARD', 'SERKA_NIGHTMARE',
  'KAZEROS_NORMAL', 'KAZEROS_HARD', 'KAZEROS_NIGHTMARE',
  'HORIZON_STEP1', 'HORIZON_STEP2', 'HORIZON_STEP3',
];

// 전체 레이드 ID (마이그레이션/초기화 루프용)
export const ALL_RAID_IDS: RaidId[] = Object.keys(RAID_META) as RaidId[];

// -----------------------------------------------------------------------------
// 공대 인원 / 배치 스크립트 헬퍼 (⭐ partySize 단일 소스)
// -----------------------------------------------------------------------------

export function getPartySize(raidId: RaidId): 4 | 8 {
  return RAID_META[raidId].partySize;
}

export function isFourPlayerRaid(raidId: RaidId): boolean {
  return getPartySize(raidId) === 4;
}

export function isRosterScopeRaid(raidId: RaidId): boolean {
  return RAID_BY_FAMILY[getRaidFamily(raidId) as RaidFamily]?.clearScope === 'roster';
}

// 배치 스크립트용 공대 설정 — partySize 에서 파생 (사용자 확정: 공식 유도)
export interface RaidPartyConfig {
  maxPerRun: number;
  maxSupportsPerRun: number;
  maxParties: number;
}

export function getRaidPartyConfig(raidId: RaidId): RaidPartyConfig {
  const ps = getPartySize(raidId);
  const is4 = ps === 4;
  return {
    maxPerRun: ps,
    maxSupportsPerRun: is4 ? 1 : 2,
    maxParties: is4 ? 1 : 2,
  };
}

// 서폿 수에 따른 공대 사이즈 상한 — partySize 기반.
//   4인: 서폿 있으면 4, 없으면 3
//   8인: 서폿 0 → 6, 1 → 7, 2+ → 8
export function getRunSizeCapBySupports(raidId: RaidId, supportCount: number): number {
  const ps = getPartySize(raidId);
  if (ps === 4) return supportCount > 0 ? 4 : 3;
  if (supportCount <= 0) return 6;
  if (supportCount === 1) return 7;
  return 8;
}

// -----------------------------------------------------------------------------
// 기간 제한 (이벤트/시즌 레이드용)
// -----------------------------------------------------------------------------

function isoToKstTime(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000;
}

export function isWithinAvailability(raid: RaidDefinition, now: Date = new Date()): boolean {
  const t = now.getTime();
  if (raid.availableFrom && t < isoToKstTime(raid.availableFrom)) return false;
  if (raid.availableUntil) {
    const untilMs = isoToKstTime(raid.availableUntil) + 24 * 60 * 60 * 1000;
    if (t >= untilMs) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// 진입 가능 레이드 산출 — 기존 getExpectedRaids / getTargetRaidsForCharacter 대체
// -----------------------------------------------------------------------------
// 정책: 각 family 마다 캐릭이 자격을 만족하는 난이도 중 가장 높은 하나.
//       HORIZON 은 top3 slice 바깥 (항상 포함), 나머지는 order 순으로 최대 3개.
//       -- 기존 로직과 전 구간 동치성 검증 완료.

// 선택적 옵션:
//   - now: 기간제 레이드 가용성 판정 기준 시점.
// 옵션 인자를 Date 로 전달하면 기존 `(ch, Date)` 호출 형태도 호환됨.
export function getEligibleRaids(
  ch: EligibilityContext,
  optionsOrDate?: { now?: Date } | Date,
): RaidId[] {
  const options = optionsOrDate instanceof Date
    ? { now: optionsOrDate }
    : (optionsOrDate ?? {});
  const now = options.now ?? new Date();

  const il = ch.itemLevel;
  const horizon: { raidId: RaidId; order: number }[] = [];
  const normal: { raidId: RaidId; order: number }[] = [];

  for (const raid of RAIDS) {
    if (!isWithinAvailability(raid, now)) continue;
    // 원정대 스코프 레이드는 여기서 제외 — getRosterRaidsForChar 가 별도 처리.
    if (raid.clearScope === 'roster') continue;

    // 싱글 선택 시: auto-selection 대신 SINGLE 난이도 사용.
    const singleId = (ch.singleRaids || []).find(
      (r) => getRaidFamily(r) === raid.family && r.endsWith('_SINGLE'),
    ) as RaidId | undefined;
    if (singleId) {
      const singleDiff = raid.difficulties.find((d) => d.tier === 'SINGLE');
      if (singleDiff && il >= singleDiff.minItemLevel) {
        if (raid.family === 'HORIZON') horizon.push({ raidId: singleId, order: raid.order });
        else normal.push({ raidId: singleId, order: raid.order });
      }
      continue;
    }

    const qualified = raid.difficulties.filter((d) => {
      if (d.tier === 'SINGLE') return false;
      if (il < d.minItemLevel) return false;
      if (d.requiresFlag && !ch[d.requiresFlag]) return false;
      return true;
    });
    if (qualified.length === 0) continue;

    const chosen = qualified.reduce((hi, d) => (d.minItemLevel > hi.minItemLevel ? d : hi));
    const raidId = encodeRaidId(raid.family, chosen.tier);

    if (raid.family === 'HORIZON') horizon.push({ raidId, order: raid.order });
    else normal.push({ raidId, order: raid.order });
  }

  horizon.sort((a, b) => a.order - b.order);
  normal.sort((a, b) => a.order - b.order);

  return [
    ...horizon.map((e) => e.raidId),
    ...normal.slice(0, 3).map((e) => e.raidId),
  ];
}

// UI 용: 캐릭이 자격을 만족하는 모든 캐릭터-스코프 레이드 (top3/제외 필터 없음).
// excludedRaids 체크박스 목록을 그릴 때 사용. 원정대 레이드는 별도 흐름이므로 제외.
export function getAllQualifiedRaids(ch: EligibilityContext, now: Date = new Date()): RaidId[] {
  const il = ch.itemLevel;
  const result: RaidId[] = [];
  for (const raid of RAIDS) {
    if (!isWithinAvailability(raid, now)) continue;
    if (raid.clearScope === 'roster') continue;

    const singleId = (ch.singleRaids || []).find(
      (r) => getRaidFamily(r) === raid.family && r.endsWith('_SINGLE'),
    ) as RaidId | undefined;
    if (singleId) {
      const singleDiff = raid.difficulties.find((d) => d.tier === 'SINGLE');
      if (singleDiff && il >= singleDiff.minItemLevel) result.push(singleId);
      continue;
    }

    const qualified = raid.difficulties.filter((d) => {
      if (d.tier === 'SINGLE') return false;
      if (il < d.minItemLevel) return false;
      if (d.requiresFlag && !ch[d.requiresFlag]) return false;
      return true;
    });
    if (qualified.length === 0) continue;
    const chosen = qualified.reduce((hi, d) => (d.minItemLevel > hi.minItemLevel ? d : hi));
    result.push(encodeRaidId(raid.family, chosen.tier));
  }
  return result;
}

// =============================================================================
// 원정대 스코프 레이드 — 특정 원정대의 "대표 캐릭" 으로 지정된 경우, 해당 캐릭의
// 주간 top3 후보에 포함시킴. 대표 지정 / 난이도 선택은 UI 에서 rosterRaidState 로 관리.
// =============================================================================

export interface RosterRaidSelection {
  selectedCharId: string;
  difficulty: DifficultyTier;
}

// { [rosterId]: { [raidFamily]: RosterRaidSelection } }
export type RosterRaidState = Record<string, Partial<Record<RaidFamily, RosterRaidSelection>>>;

// 이 캐릭이 대표로 지정된 원정대 스코프 레이드의 RaidId 목록.
// 캐릭의 rosterId 와 아이템 레벨/플래그 자격 모두 만족해야 반환.
export function getRosterRaidsForChar(
  ch: EligibilityContext & { id: string; rosterId?: string; discordName?: string },
  rosterRaidState: RosterRaidState | undefined,
  now: Date = new Date()
): RaidId[] {
  if (!rosterRaidState) return [];
  const rosterId = ch.rosterId || ch.discordName;
  if (!rosterId) return [];
  const selections = rosterRaidState[rosterId] || {};

  const out: RaidId[] = [];
  for (const [family, sel] of Object.entries(selections)) {
    if (!sel || sel.selectedCharId !== ch.id) continue;
    const def = RAID_BY_FAMILY[family as RaidFamily];
    if (!def) continue;
    if (def.clearScope !== 'roster') continue;
    if (!isWithinAvailability(def, now)) continue;

    const diff = def.difficulties.find(d => d.tier === sel.difficulty);
    if (!diff) continue;
    if (ch.itemLevel < diff.minItemLevel) continue;
    if (diff.requiresFlag && !ch[diff.requiresFlag]) continue;

    out.push(encodeRaidId(def.family, diff.tier));
  }
  return out;
}

// 원정대 레이드의 "자동 기본 대표" 추천 — 해당 원정대 캐릭 중 가장 높은 itemLevel
// 로 해당 family 의 (아무 tier) 를 자격 만족하는 캐릭. 자격자 없으면 null.
export function suggestDefaultRep(
  family: RaidFamily,
  rosterChars: Array<EligibilityContext & { id: string; itemLevel: number }>,
  now: Date = new Date()
): { charId: string; difficulty: DifficultyTier } | null {
  const def = RAID_BY_FAMILY[family];
  if (!def) return null;
  if (!isWithinAvailability(def, now)) return null;

  const sorted = [...rosterChars].sort((a, b) => b.itemLevel - a.itemLevel);
  for (const ch of sorted) {
    const qualified = def.difficulties.filter(d => {
      if (ch.itemLevel < d.minItemLevel) return false;
      if (d.requiresFlag && !ch[d.requiresFlag]) return false;
      return true;
    });
    if (qualified.length === 0) continue;
    const chosen = qualified.reduce((hi, d) => (d.minItemLevel > hi.minItemLevel ? d : hi));
    return { charId: ch.id, difficulty: chosen.tier };
  }
  return null;
}

// 전체 원정대 스코프 레이드 정의 목록 (UI 섹션 렌더링용).
export function getRosterScopeRaids(now: Date = new Date()): RaidDefinition[] {
  return RAIDS.filter(r => r.clearScope === 'roster' && isWithinAvailability(r, now));
}

// =============================================================================
// 캐릭별 주간 TOP 3 레이드 계산 — UserRaidProgressPanel 과 동일 로직을
// 재사용해 "스케줄/배치" 와 "개인별 진행현황" 일관성 유지.
// =============================================================================

export interface TopRaidsContext {
  id: string;
  itemLevel: number;
  discordName: string;
  rosterId?: string;
  serkaNightmare?: boolean;
  receiveBoundGold?: boolean;
  goldOption?: string;
  singleRaids?: RaidId[];
}

// 원장 엔트리 최소 형태 (types.ts ClearEntry 와 필드만 맞추면 됨).
interface CharClearsLike {
  [raidId: string]: { raidId: RaidId; generalGold: number; boundGold: number } | undefined;
}
interface AllClearsLike {
  [charId: string]: CharClearsLike | undefined;
}

// 이 캐릭의 주간 top3 (UserRaidProgressPanel 와 같은 공식).
// 반환: top3 RaidId 배열 (effective 골드 내림차순).
export function getCharTopRaidIds(
  ch: TopRaidsContext,
  userChars: TopRaidsContext[],
  clears: AllClearsLike | undefined,
  rosterRaidState: RosterRaidState | undefined,
  now: Date = new Date(),
): RaidId[] {
  // ignoreBound 판정 (UserRaidProgressPanel / Worker 와 동일).
  let ignoreBound = false;
  if (ch.receiveBoundGold !== undefined) {
    ignoreBound = !ch.receiveBoundGold;
  } else {
    const option = ch.goldOption || 'ALL_MAX';
    if (option === 'GENERAL_MAX') ignoreBound = true;
    else if (option === 'MAIN_ALL_ALT_GENERAL' && userChars.length > 0) {
      const mainChar = userChars.reduce((max, curr) => curr.itemLevel > max.itemLevel ? curr : max, userChars[0]);
      if (ch.id !== mainChar.id) ignoreBound = true;
    }
  }

  // 캐릭 스코프 / 원정대 스코프 분리.
  // 원정대 레이드(카제로스 등)는 3회 골드 제한에 포함되지 않으므로 별도 집계.
  type Cand = { id: RaidId; general: number; bound: number };
  const charCandByFamily = new Map<string, Cand>();
  const rosterCandByFamily = new Map<string, Cand>();

  const charClears = (clears && clears[ch.id]) || {};
  for (const key of Object.keys(charClears)) {
    const e = charClears[key];
    if (!e) continue;
    const fam = getRaidFamily(e.raidId);
    const isRoster = RAID_BY_FAMILY[fam as RaidFamily]?.clearScope === 'roster';
    const target = isRoster ? rosterCandByFamily : charCandByFamily;
    target.set(fam, { id: e.raidId, general: e.generalGold, bound: e.boundGold });
  }

  const charQualified = getAllQualifiedRaids(ch, now);
  for (const id of charQualified) {
    const fam = getRaidFamily(id);
    if (charCandByFamily.has(fam)) continue;
    const meta = RAID_META[id];
    charCandByFamily.set(fam, { id, general: meta.generalGold, bound: meta.boundGold });
  }

  const rosterQualified = getRosterRaidsForChar(ch, rosterRaidState, now);
  for (const id of rosterQualified) {
    const fam = getRaidFamily(id);
    if (rosterCandByFamily.has(fam)) continue;
    const meta = RAID_META[id];
    rosterCandByFamily.set(fam, { id, general: meta.generalGold, bound: meta.boundGold });
  }

  const eff = (c: Cand) => {
    const isSplit = c.general > 0 && c.bound > 0;
    return c.general + (isSplit || !ignoreBound ? c.bound : 0);
  };

  const charTop3 = Array.from(charCandByFamily.values())
    .map(y => ({ ...y, effective: eff(y) }))
    .filter(y => y.effective > 0)
    .sort((a, b) => b.effective - a.effective)
    .slice(0, 3)
    .map(y => y.id);

  const rosterIds = Array.from(rosterCandByFamily.values())
    .filter(y => eff(y) > 0)
    .map(y => y.id);

  return [...charTop3, ...rosterIds];
}

// -----------------------------------------------------------------------------
// 싱글모드 헬퍼
// -----------------------------------------------------------------------------

// itemLevel 기준으로 SINGLE 난이도에 자격이 되는 raidId 목록 반환 (CharacterFormList 용).
export function getSingleModeRaidIds(itemLevel: number, now: Date = new Date()): RaidId[] {
  const result: RaidId[] = [];
  for (const raid of RAIDS) {
    if (!isWithinAvailability(raid, now)) continue;
    for (const diff of raid.difficulties) {
      if (diff.tier !== 'SINGLE') continue;
      if (itemLevel < diff.minItemLevel) continue;
      result.push(encodeRaidId(raid.family, diff.tier));
    }
  }
  return result;
}

// -----------------------------------------------------------------------------
// 유효 골드 계산 — top3 선정 + 합산을 하나로 통합
// -----------------------------------------------------------------------------
// 귀속 제외 유저(ignoreBound=true)는 generalGold 만 획득.
// 획득 불가능(0)인 경우 -1 을 돌려 top3 후보에서 자연 제외.

export function getEffectiveGold(meta: RaidMetaEntry, ignoreBound: boolean): number {
  const g = meta.generalGold + (ignoreBound ? 0 : meta.boundGold);
  return g > 0 ? g : -1;
}
