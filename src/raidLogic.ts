import type {
  Character,
  RaidId,
  RaidRun,
  RaidRunParty,
  RaidSchedule,
  RaidExclusionMap,
  RaidSettingsMap,
} from './types';

// ✅ 시드 기반 난수 생성기 (Seeded RNG) - Mulberry32
function createSeededRandom(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BalanceMode = 'overall' | 'role' | 'speed';
type BalanceDimension = 'overall' | 'role';

function getBalanceDimension(mode: BalanceMode): BalanceDimension {
  return mode === 'role' ? 'role' : 'overall';
}
function isSpeedMode(mode: BalanceMode): boolean {
  return mode === 'speed';
}

/** ✅ 세르카 나이트메어 고정 1공대(정확한 캐릭 지정: discordName + jobCode) */
const SERKA_NM_FIXED_TARGETS = [
  { discordName: '딘또썬', jobCode: '기상' },
  { discordName: '말랭짱', jobCode: '슬레' },
  { discordName: '흑마66', jobCode: '워로' },
  { discordName: '고추좋아해요', jobCode: '홀나' },
] as const;

function isSerkaRaid(raidId: RaidId): boolean {
  return raidId === 'SERKA_NORMAL' || raidId === 'SERKA_HARD' || raidId === 'SERKA_NIGHTMARE';
}

type RaidConfig = {
  maxPerRun: number;          // 한 런의 총 인원
  maxSupportsPerRun: number;  // 한 런에서 서폿 최대
  maxParties: number;         // 런 내 파티 수
};

function getRaidConfig(raidId: RaidId): RaidConfig {
  // ✅ 세르카: 4인(딜3+서폿1), 1파티
  if (isSerkaRaid(raidId)) {
    return { maxPerRun: 4, maxSupportsPerRun: 1, maxParties: 1 };
  }
  // ✅ 그 외: 8인(4+4), 2파티
  return { maxPerRun: 8, maxSupportsPerRun: 2, maxParties: 2 };
}

function estimateRunCount(raidId: RaidId, characters: Character[]): number {
  if (characters.length === 0) return 0;
  const cfg = getRaidConfig(raidId);
  const maxPerRun = cfg.maxPerRun;

  const perPlayerCount: Record<string, number> = {};
  characters.forEach((ch) => {
    perPlayerCount[ch.discordName] = (perPlayerCount[ch.discordName] || 0) + 1;
  });

  const maxCharsForOnePlayer = Object.values(perPlayerCount).reduce(
    (max, v) => (v > max ? v : max),
    0,
  );

  const baseRunsBySize = Math.ceil(characters.length / maxPerRun);
  return Math.max(baseRunsBySize, maxCharsForOnePlayer || 1);
}

/**
 * ✅ 레이드가 랏폿(true)일 때만: "발키 + 서폿 가능"(valkyCanSupport) 캐릭터를
 *   필요한 만큼 서폿으로 승격해서 공팟에서 딜러를 받기 쉬운 경우의 수를 열어둔다.
 */
function promoteValkyToSupportIfNeeded(raidId: RaidId, characters: Character[]): Character[] {
  const cfg = getRaidConfig(raidId);

  const candidates = characters
    .filter(
      (c) =>
        c.jobCode === '발키' &&
        c.role === 'DPS' &&
        c.valkyCanSupport === true,
    )
    // ✅ 딜러 전투력 손실을 최소화하기 위해 낮은 전투력부터 승격
    .slice()
    .sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id));

  if (candidates.length === 0) return characters;

  const runCount = estimateRunCount(raidId, characters);
  const requiredSupports = runCount * cfg.maxSupportsPerRun;
  const existingSupports = characters.filter((c) => c.role === 'SUPPORT').length;

  const need = requiredSupports - existingSupports;
  if (need <= 0) return characters;

  const promote = candidates.slice(0, need);
  const promoteIds = new Set(promote.map((c) => c.id));

  return characters.map((c) => (promoteIds.has(c.id) ? { ...c, role: 'SUPPORT' } : c));
}

export function getBaseRaidPlanForCharacter(itemLevel: number): RaidId[] {
  if (itemLevel >= 1730) return ['ACT3_HARD', 'ACT4_HARD', 'FINAL_HARD'];
  if (itemLevel >= 1720) return ['ACT3_HARD', 'ACT4_HARD', 'FINAL_NORMAL'];
  if (itemLevel >= 1710) return ['ACT3_HARD', 'ACT4_NORMAL', 'FINAL_NORMAL'];
  if (itemLevel >= 1700) return ['ACT3_HARD', 'ACT4_NORMAL'];
  return [];
}

function getSerkaPlanForCharacter(
  ch: Character,
  exclusions: RaidExclusionMap,
): RaidId[] {
  const il = ch.itemLevel;
  const id = ch.id;

  const isExcluded = (raidId: RaidId) =>
    (exclusions?.[raidId] || []).includes(id);

  const pick = (raidId: RaidId | null) => (raidId ? [raidId] : []);

  // 1740+ : (체크 시) 나이트메어 우선 / (미체크) 하드부터
  if (il >= 1740) {
    const wantsNightmare = ch.serkaNightmare ?? true;
    const candidates: RaidId[] = wantsNightmare
      ? ['SERKA_NIGHTMARE', 'SERKA_HARD', 'SERKA_NORMAL']
      : ['SERKA_HARD', 'SERKA_NORMAL'];

    for (const raidId of candidates) {
      if (raidId === 'SERKA_NIGHTMARE' && il < 1740) continue;
      if (raidId === 'SERKA_HARD' && il < 1730) continue;
      if (raidId === 'SERKA_NORMAL' && il < 1710) continue;
      if (!isExcluded(raidId)) return pick(raidId);
    }
    return [];
  }

  // 1730+ : 기본 하드, 제외 시 노말
  if (il >= 1730) {
    if (!isExcluded('SERKA_HARD')) return pick('SERKA_HARD');
    if (il >= 1710 && !isExcluded('SERKA_NORMAL')) return pick('SERKA_NORMAL');
    return [];
  }

  // 1710+ : 노말
  if (il >= 1710) {
    if (!isExcluded('SERKA_NORMAL')) return pick('SERKA_NORMAL');
  }

  return [];
}

interface RaidBucket {
  raidId: RaidId;
  characters: Character[];
}

/** 표준편차 계산 */
function std(values: number[]): number {
  const arr = values.filter((v) => Number.isFinite(v));
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance =
    arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / arr.length;
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  const arr = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return (arr[mid - 1] + arr[mid]) / 2;
}

function runAvg(run: Character[]): number {
  if (run.length === 0) return 0;
  const total = run.reduce((sum, m) => sum + m.combatPower, 0);
  return total / run.length;
}

function sizesByIndex(runsMembers: Character[][]): number[] {
  return runsMembers.map((r) => r.length);
}

function computeRunsCost(
  runsMembers: Character[][],
  dim: BalanceDimension,
): number {
  const nonEmpty = runsMembers.filter((r) => r.length > 0);
  if (nonEmpty.length <= 1) return 0;

  if (dim === 'overall') {
    const overallAvgs = nonEmpty.map((run) => runAvg(run));
    return std(overallAvgs);
  }

  const dpsAvgs: number[] = [];
  const supAvgs: number[] = [];

  nonEmpty.forEach((run) => {
    let dpsSum = 0;
    let dpsCnt = 0;
    let supSum = 0;
    let supCnt = 0;

    run.forEach((m) => {
      if (m.role === 'DPS') {
        dpsSum += m.combatPower;
        dpsCnt++;
      } else {
        supSum += m.combatPower;
        supCnt++;
      }
    });

    dpsAvgs.push(dpsCnt > 0 ? dpsSum / dpsCnt : 0);
    supAvgs.push(supCnt > 0 ? supSum / supCnt : 0);
  });

  return std(dpsAvgs) + std(supAvgs);
}

function canAddToRunGreedy(
  runMembers: Character[],
  runPlayerCounts: Record<string, number>,
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  const playerCountInThisRun = runPlayerCounts[ch.discordName] || 0;
  if (playerCountInThisRun > 0) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;
    if (sameJob >= 2) return false;
  } else {
    // SUPPORT
    const supCount = runMembers.filter((m) => m.role === 'SUPPORT').length;
    
    // 1. 절대적 최대치 체크 (보통 2명)
    if (supCount >= maxSupportsPerRun) return false;

    // ✅ 2. [인원수 비례 제한] 8인 레이드(maxPerRun > 4)인 경우:
    // "현재 서폿이 1명 있는데, 총 인원이 4명 미만(즉, 이번에 들어가도 4명 이하)이면" 
    // -> 2번째 서폿을 받지 않는다.
    // (최소한 딜러가 3명 차서 4명이 된 후, 5명째부터 2번째 서폿을 받음)
    if (maxPerRun > 4 && supCount >= 1 && runMembers.length < 4) {
      return false;
    }
  }
  return true;
}

function canAddToRunLocalSearch(
  runMembers: Character[],
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  if (runMembers.some((m) => m.discordName === ch.discordName)) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;
    if (sameJob >= 2) return false;
  } else {
    // SUPPORT
    const supCount = runMembers.filter((m) => m.role === 'SUPPORT').length;
    
    if (supCount >= maxSupportsPerRun) return false;

    // ✅ [인원수 비례 제한] 위와 동일
    if (maxPerRun > 4 && supCount >= 1 && runMembers.length < 4) {
      return false;
    }
  }
  return true;
}

/**
 * ✅ lockIds: 고정 멤버(이동 금지)
 */
function optimizeRunsByStdDev(
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  dim: BalanceDimension,
  random: () => number,
  lockIds: Set<string> = new Set(),
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const charToRun: Record<string, number> = {};
  runs.forEach((run, ri) => {
    run.forEach((c) => {
      charToRun[c.id] = ri;
    });
  });

  const allCharacters: Character[] = runs.flat();
  if (allCharacters.length === 0) return runs;

  let bestCost = computeRunsCost(runs, dim);
  const maxIterations = allCharacters.length * 40;

  for (let iter = 0; iter < maxIterations; iter++) {
    const cIndex = Math.floor(random() * allCharacters.length);
    const ch = allCharacters[cIndex];

    if (lockIds.has(ch.id)) continue; // ✅ 고정 멤버 이동 금지

    const from = charToRun[ch.id];
    if (from === undefined) continue;

    let to = Math.floor(random() * runCount);
    let guard = 0;
    while (to === from && guard < 5) {
      to = Math.floor(random() * runCount);
      guard++;
    }
    if (to === from) continue;

    const fromRun = runs[from];
    const toRun = runs[to];

    if (!canAddToRunLocalSearch(toRun, ch, maxPerRun, maxSupportsPerRun)) continue;

    const idxInFrom = fromRun.findIndex((m) => m.id === ch.id);
    if (idxInFrom === -1) continue;

    fromRun.splice(idxInFrom, 1);
    toRun.push(ch);

    const newCost = computeRunsCost(runs, dim);

    if (newCost <= bestCost) {
      bestCost = newCost;
      charToRun[ch.id] = to;
    } else {
      toRun.pop();
      fromRun.splice(idxInFrom, 0, ch);
    }
  }

  return runs;
}

/**
 * ✅ Speed 모드 최적화
 * - isSupportShortage === true : 4인이하 1서폿 강제, 5인이상 서폿부족 페널티 (랏폿 모드)
 * - isSupportShortage === false : 기존 로직 (단순 분산 및 채우기)
 */
function optimizeRunsForSpeed(
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  lockIds: Set<string> = new Set(),
  isSupportShortage: boolean = false, // ✅ 옵션 추가
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const totalPlayers = new Set(runs.flat().map((c) => c.discordName)).size;
  const fullTarget = Math.min(totalPlayers, maxPerRun);

  // 1. 벡터 (인원수 채우기 우선순위)
  const speedVector = (candidateRuns: Character[][]) => {
    const sizes = sizesByIndex(candidateRuns).slice().sort((a, b) => b - a);
    const fullCount = sizes.filter((s) => s >= fullTarget).length;
    const minSize = sizes.length ? sizes[sizes.length - 1] : 0;
    return [fullCount, minSize, ...sizes];
  };

  const lexBetterVec = (nextVec: number[], curVec: number[]) => {
    for (let i = 0; i < Math.min(nextVec.length, curVec.length); i++) {
      if (nextVec[i] === curVec[i]) continue;
      return nextVec[i] > curVec[i];
    }
    return false;
  };

  // 2. 유효성 검사
  const validRun = (run: Character[]) => {
    if (run.length > maxPerRun) return false;

    const names = new Set<string>();
    for (const m of run) {
      if (names.has(m.discordName)) return false;
      names.add(m.discordName);
    }

    const supCount = run.filter((m) => m.role === 'SUPPORT').length;
    
    // ✅ [분기] 랏폿 모드일 때만 '4명 이하 1서폿' 강제
    let dynamicMaxSup = maxSupportsPerRun;
    if (isSupportShortage && maxPerRun > 4 && run.length <= 4) {
      dynamicMaxSup = 1;
    }
    
    if (supCount > dynamicMaxSup) return false;

    const dps = run.filter((m) => m.role === 'DPS');
    const cnt: Record<string, number> = {};
    for (const m of dps) {
      cnt[m.jobCode] = (cnt[m.jobCode] || 0) + 1;
      if (cnt[m.jobCode] > 2) return false;
    }
    return true;
  };

  // 3. 목표 함수 (점수 계산)
  const objective = (candidateRuns: Character[][]) => {
    const nonEmpty = candidateRuns.filter((r) => r.length > 0);
    const avgs = nonEmpty.map((r) => runAvg(r));
    const sd = std(avgs);
    
    const med = median(avgs);
    const sizes = sizesByIndex(candidateRuns);
    const minSize = Math.min(...sizes);
    
    const minIdxs = sizes
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s === minSize)
      .map((x) => x.i);
    const medPenalty = minIdxs.reduce((sum, idx) => {
      return sum + Math.abs(runAvg(candidateRuns[idx]) - med);
    }, 0);

    const range = avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;

    let supportCrowding = 0;
    let supportStarvation = 0;

    // ✅ [분기] 랏폿 모드일 때만 특수 페널티 계산
    if (isSupportShortage) {
      candidateRuns.forEach((run) => {
        if (run.length === 0) return;
        const supCnt = run.filter((m) => m.role === 'SUPPORT').length;
        
        // Crowding: 4인 이하 2서폿 이상 (이미 validRun에서 막지만 점수로서도 페널티)
        if (maxPerRun > 4 && run.length <= 4 && supCnt > 1) {
          supportCrowding += (supCnt - 1) * 100;
        }

        // Starvation: 5인 이상인데 서폿 부족
        if (maxPerRun > 4 && run.length >= 5) {
          const missing = Math.max(0, maxSupportsPerRun - supCnt);
          if (missing > 0) {
            supportStarvation += missing * 50;
          }
        }
      });
    }

    return { supportCrowding, supportStarvation, sd, range, medPenalty };
  };

  // 4. 비교 함수
  const betterObj = (
    a: ReturnType<typeof objective>,
    b: ReturnType<typeof objective>,
  ) => {
    // ✅ [분기] 랏폿 모드일 때만 서폿 배분 문제를 최우선으로 봄
    if (isSupportShortage) {
      if (a.supportCrowding !== b.supportCrowding) return a.supportCrowding < b.supportCrowding;
      if (a.supportStarvation !== b.supportStarvation) return a.supportStarvation < b.supportStarvation;
    }
    
    // 공통: 표준편차(SD)가 낮을수록 좋음 (골고루 퍼짐)
    if (a.sd !== b.sd) return a.sd < b.sd;
    if (a.range !== b.range) return a.range < b.range;
    return a.medPenalty < b.medPenalty;
  };

  // --- 기존 최적화 로직 (Move & Swap) 유지 ---
  const maxMoveIterations = runs.flat().length * 60;
  for (let iter = 0; iter < maxMoveIterations; iter++) {
    const curVec = speedVector(runs);
    let bestMove = null;

    for (let from = 0; from < runCount; from++) {
      if (runs[from].length === 0) continue;
      for (let to = 0; to < runCount; to++) {
        if (to === from) continue;
        if (runs[to].length >= maxPerRun) continue; 

        for (let ci = 0; ci < runs[from].length; ci++) {
          const ch = runs[from][ci];
          if (lockIds.has(ch.id)) continue; 

          if (!canAddToRunLocalSearch(runs[to], ch, maxPerRun, maxSupportsPerRun)) continue;

          const nextRuns = runs.map((r) => r.slice());
          const picked = nextRuns[from].splice(ci, 1)[0];
          nextRuns[to].push(picked);

          if (!validRun(nextRuns[from]) || !validRun(nextRuns[to])) continue;

          const nextVec = speedVector(nextRuns);
          if (!lexBetterVec(nextVec, curVec)) continue;

          const nextObj = objective(nextRuns);
          if (
            !bestMove ||
            lexBetterVec(nextVec, bestMove.nextVec) ||
            (nextVec.join(',') === bestMove.nextVec.join(',') &&
              betterObj(nextObj, bestMove.nextObj))
          ) {
            bestMove = { nextRuns, nextObj, nextVec };
          }
        }
      }
    }
    if (!bestMove) break;
    for (let i = 0; i < runCount; i++) runs[i] = bestMove.nextRuns[i];
  }

  const fixedVec = speedVector(runs);
  let curObj = objective(runs);

  const maxSwapIterations = runs.flat().length * 120;
  for (let iter = 0; iter < maxSwapIterations; iter++) {
    let improved = false;

    outer: for (let aIdx = 0; aIdx < runCount; aIdx++) {
      for (let bIdx = aIdx + 1; bIdx < runCount; bIdx++) {
        if (!runs[aIdx].length || !runs[bIdx].length) continue;

        for (let ai = 0; ai < runs[aIdx].length; ai++) {
          for (let bi = 0; bi < runs[bIdx].length; bi++) {
            const A = runs[aIdx][ai];
            const B = runs[bIdx][bi];

            if (lockIds.has(A.id) || lockIds.has(B.id)) continue;

            const nextRuns = runs.map((r) => r.slice());
            nextRuns[aIdx].splice(ai, 1, B);
            nextRuns[bIdx].splice(bi, 1, A);

            const nextVec = speedVector(nextRuns);
            if (nextVec.join(',') !== fixedVec.join(',')) continue;

            if (!validRun(nextRuns[aIdx]) || !validRun(nextRuns[bIdx])) continue;

            const nextObj = objective(nextRuns);
            if (betterObj(nextObj, curObj)) {
              for (let k = 0; k < runCount; k++) runs[k] = nextRuns[k];
              curObj = nextObj;
              improved = true;
              break outer;
            }
          }
        }
      }
    }

    if (!improved) break;
  }

  return runs;
}

function groupCharactersByRaid(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
): RaidBucket[] {
  const map: Record<RaidId, Character[]> = {
    ACT3_HARD: [],
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  characters.forEach((ch) => {
    const base = getBaseRaidPlanForCharacter(ch.itemLevel);
    const serka = getSerkaPlanForCharacter(ch, exclusions);

    // ✅ 세르카를 가는 캐릭터는 3막 하드 제외 (상위 3개 유지)
    let raids =
      serka.length > 0
        ? [...base.filter((r) => r !== 'ACT3_HARD'), ...serka]
        : base;

    // ✅ (세르카 미출시 임시) 1710+도 3막 하드 필수
    // 세르카 출시 이후엔 아래 한 줄만 주석처리하면, 다시 상위 3개 로직으로 돌아감
    if (serka.length > 0) raids = base;

    raids.slice(0, 3).forEach((raidId) => {
      const excludedList = exclusions[raidId];
      if (excludedList && excludedList.includes(ch.id)) return;
      map[raidId].push(ch);
    });
  });

  return (Object.keys(map) as RaidId[]).map((raidId) => ({
    raidId,
    characters: map[raidId].sort(
      (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
    ),
  }));
}

/** ✅ 세르카 나이트메어 고정 멤버 추출(디스코드명+직업 정확히 매칭) */
function pickSerkaNightmareFixedMembers(characters: Character[]): Character[] | null {
  const picked: Character[] = [];
  const pickedIds = new Set<string>();

  for (const t of SERKA_NM_FIXED_TARGETS) {
    const cand = characters
      .filter((c) => c.discordName === t.discordName && c.jobCode === t.jobCode && !pickedIds.has(c.id))
      .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id))[0];

    if (!cand) return null;
    picked.push(cand);
    pickedIds.add(cand.id);
  }

  return picked;
}

function distributeCharactersIntoRuns(
  raidId: RaidId,
  characters: Character[],
  balanceMode: BalanceMode,
  random: () => number,
  isSupportShortage: boolean,
): RaidRun[] {
  if (characters.length === 0) return [];

  const cfg = getRaidConfig(raidId);
  const maxPerRun = cfg.maxPerRun;
  const maxSupportsPerRun = cfg.maxSupportsPerRun;

  const dim = getBalanceDimension(balanceMode);
  const speed = isSpeedMode(balanceMode);

  // ✅ 세르카 나이트메어: 고정 1공대(이동 금지)
  const lockIds = new Set<string>();
  let fixedMembers: Character[] | null = null;

  if (raidId === 'SERKA_NIGHTMARE') {
    const picked = pickSerkaNightmareFixedMembers(characters);
    if (picked) {
      fixedMembers = picked;
      picked.forEach((c) => lockIds.add(c.id));
    }
  }

  const perPlayerCount: Record<string, number> = {};
  characters.forEach((ch) => {
    perPlayerCount[ch.discordName] = (perPlayerCount[ch.discordName] || 0) + 1;
  });

  const maxCharsForOnePlayer = Object.values(perPlayerCount).reduce(
    (max, v) => (v > max ? v : max),
    0,
  );

  const baseRunsBySize = Math.ceil(characters.length / maxPerRun);
  const runCount = Math.max(baseRunsBySize, maxCharsForOnePlayer || 1);

  const runsMembers: Character[][] = Array.from({ length: runCount }, () => []);
  const runsTotalPower: number[] = Array(runCount).fill(0);
  const runsDpsPower: number[] = Array(runCount).fill(0);
  const runsSupPower: number[] = Array(runCount).fill(0);
  const runsPlayerCounts: Array<Record<string, number>> = Array.from(
    { length: runCount },
    () => ({}),
  );

  // ✅ 고정 멤버가 성립하면 1런에 먼저 박아둠
  if (fixedMembers && runCount > 0) {
    runsMembers[0] = [...fixedMembers];
    for (const m of fixedMembers) {
      runsTotalPower[0] += m.combatPower;
      if (m.role === 'DPS') runsDpsPower[0] += m.combatPower;
      else runsSupPower[0] += m.combatPower;
      runsPlayerCounts[0][m.discordName] = (runsPlayerCounts[0][m.discordName] || 0) + 1;
    }
  }

  // 고정 멤버는 분배 풀에서 제거
  let sorted: Character[] = [...characters]
    .filter((c) => !lockIds.has(c.id))
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  // speed 모드 seed는 그대로 유지(고정멤버가 이미 들어간 run0은 꽉 차서 자동으로 건드리지 못함)
  // (여기서는 기존 seed 로직이 없는 버전이었으면 생략해도 됨)

  sorted.forEach((ch) => {
    let bestIndex = -1;
    let bestScore: [number, number, number] | null = null;

    for (let i = 0; i < runCount; i++) {
      if (!canAddToRunGreedy(runsMembers[i], runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun)) continue;

      const size = runsMembers[i].length;
      const metric =
        dim === 'overall'
          ? runsTotalPower[i]
          : ch.role === 'DPS'
            ? runsDpsPower[i]
            : runsSupPower[i];

      const score: [number, number, number] = speed
        ? [-size, metric, i]
        : [metric, size, i];

      if (!bestScore) {
        bestScore = score;
        bestIndex = i;
      } else {
        if (
          score[0] < bestScore[0] ||
          (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
          (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
        ) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    if (bestIndex === -1) {
      // 완전 fallback: 가장 작은 런
      let minSize = Infinity;
      let fallbackIndex = 0;
      for (let i = 0; i < runCount; i++) {
        const size = runsMembers[i].length;
        if (size < minSize) {
          minSize = size;
          fallbackIndex = i;
        }
      }
      bestIndex = fallbackIndex;
    }

    if (runsMembers[bestIndex].length < maxPerRun) {
      runsMembers[bestIndex].push(ch);
      runsTotalPower[bestIndex] += ch.combatPower;
      if (ch.role === 'DPS') runsDpsPower[bestIndex] += ch.combatPower;
      else runsSupPower[bestIndex] += ch.combatPower;

      runsPlayerCounts[bestIndex][ch.discordName] =
        (runsPlayerCounts[bestIndex][ch.discordName] || 0) + 1;
    }
  });

  const optimizedRunsMembers = speed
    ? optimizeRunsForSpeed(runsMembers, maxPerRun, maxSupportsPerRun, lockIds, isSupportShortage) // <-- 전달
    : optimizeRunsByStdDev(runsMembers, maxPerRun, maxSupportsPerRun, dim, random, lockIds);

  const runs: RaidRun[] = [];
  optimizedRunsMembers.forEach((members, idx) => {
    if (members.length === 0) return;

    const parties = splitIntoParties(members, raidId);
    if (parties.length === 0) return;

    const avgPower =
      members.reduce((sum, c) => sum + c.combatPower, 0) / members.length;

    runs.push({
      raidId,
      runIndex: idx + 1,
      parties,
      averageCombatPower: Math.round(avgPower),
    });
  });

  return runs;
}

function splitIntoParties(members: Character[], raidId: RaidId): RaidRunParty[] {
  const cfg = getRaidConfig(raidId);

  const maxParties = cfg.maxParties;
  const maxPartySize = 4;

  // ✅ 세르카 파티 목표: 딜3 + 서폿1
  const maxDpsPerParty = 3;
  const maxSupPerParty = 1;

  const supports = [...members]
    .filter((m) => m.role === 'SUPPORT')
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));
  const dps = [...members]
    .filter((m) => m.role === 'DPS')
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  const parties: RaidRunParty[] = Array.from({ length: maxParties }).map(
    (_, idx) => ({
      partyIndex: idx + 1,
      members: [],
    }),
  );

  const usedIds = new Set<string>();

  const addMemberToParty = (party: RaidRunParty | undefined, c: Character) => {
    if (!party) return false;
    if (usedIds.has(c.id)) return false;
    if (party.members.length >= maxPartySize) return false;
    party.members.push(c);
    usedIds.add(c.id);
    return true;
  };

  const party1 = parties[0];
  const party2 = parties[1];

  // --- Party 1: 서폿 1명 ---
const p1Sup = supports.find((s) => !usedIds.has(s.id));
if (p1Sup) {
  const supCountInP1 = party1.members.filter((m) => m.role === 'SUPPORT').length;
  if (supCountInP1 < maxSupPerParty) addMemberToParty(party1, p1Sup);
}

  // --- Party 1: 딜러 최대 3명 (직업 중복 최대 1 허용) ---
  for (const d of dps) {
    if (usedIds.has(d.id)) continue;

    const dpsCount = party1.members.filter((m) => m.role === 'DPS').length;
    if (dpsCount >= maxDpsPerParty) break;

    const sameJobCount = party1.members.filter(
      (m) => m.role === 'DPS' && m.jobCode === d.jobCode,
    ).length;

    if (sameJobCount >= 1) continue; // ✅ 여기 중요(누락 방지)

    addMemberToParty(party1, d);
  }

  // ✅ 세르카(1파티)면 여기서 끝
  if (cfg.maxParties === 1) {
    return parties.filter((p) => p.members.length > 0);
  }

  // ===== 8인 레이드(2파티) =====

  // Party 2: 서폿 1명
if (party2) {
  const p2Sup = supports.find((s) => !usedIds.has(s.id));
  if (p2Sup) {
    const supCountInP2 = party2.members.filter((m) => m.role === 'SUPPORT').length;
    if (supCountInP2 < maxSupPerParty) addMemberToParty(party2, p2Sup);
  }
}

  // Party 2: 딜러 최대 3명 (직업 중복 최대 1 허용)
  if (party2) {
    for (const d of dps) {
      if (usedIds.has(d.id)) continue;

      const dpsCount = party2.members.filter((m) => m.role === 'DPS').length;
      if (dpsCount >= maxDpsPerParty) break;

      const sameJobCount = party2.members.filter(
        (m) => m.role === 'DPS' && m.jobCode === d.jobCode,
      ).length;

      if (sameJobCount >= 1) continue;

      addMemberToParty(party2, d);
    }
  }

  return parties.filter((p) => p.members.length > 0);
}

// ✅ 메인 함수
export function buildRaidSchedule(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  balanceMode: BalanceMode = 'overall',
  raidSettings: RaidSettingsMap = {},
): RaidSchedule {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered, exclusions);

  const SEED = 123456789;
  const seededRng = createSeededRandom(SEED);

  const schedule: RaidSchedule = {
    ACT3_HARD: [],
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  buckets.forEach(({ raidId, characters }) => {
    // ✅ 랏폿 모드 체크 여부 확인
    const supportShortage = Boolean(raidSettings?.[raidId]);
    
    // 발키 승격 로직
    const pool = supportShortage
      ? promoteValkyToSupportIfNeeded(raidId, characters)
      : characters;

    schedule[raidId] = distributeCharactersIntoRuns(
      raidId,
      pool,
      balanceMode,
      seededRng,
      supportShortage, // <-- 함수에 전달
    );
  });

  return schedule;
}
