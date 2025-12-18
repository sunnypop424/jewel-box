import type {
  Character,
  RaidId,
  RaidRun,
  RaidRunParty,
  RaidSchedule,
  RaidExclusionMap,
} from './types';

// ✅ 전투력 밸런싱 + 스피드 모드
// 'overall' : 딜/서폿 구분 없이 전체 평균 전투력 기준(표준편차 최소)
// 'role'    : 딜/서폿 평균 전투력을 각각 맞추는 모드(표준편차 합 최소)
// 'speed'   : ✅ 참가 인원수 최우선(앞 공대부터 최대한 채움) + 남는 소인원 공대 평균은 median 근처
export type BalanceMode = 'overall' | 'role' | 'speed';

type BalanceDimension = 'overall' | 'role';

function getBalanceDimension(mode: BalanceMode): BalanceDimension {
  return mode === 'role' ? 'role' : 'overall'; // speed는 overall 기준
}
function isSpeedMode(mode: BalanceMode): boolean {
  return mode === 'speed';
}

// 아이템 레벨 → 어떤 레이드를 도는지
export function getRaidPlanForCharacter(itemLevel: number): RaidId[] {
  if (itemLevel >= 1730) {
    return ['ACT3_HARD', 'ACT4_HARD', 'FINAL_HARD'];
  }
  if (itemLevel >= 1720) {
    return ['ACT3_HARD', 'ACT4_HARD', 'FINAL_NORMAL'];
  }
  if (itemLevel >= 1710) {
    return ['ACT3_HARD', 'ACT4_NORMAL', 'FINAL_NORMAL'];
  }
  if (itemLevel >= 1700) {
    return ['ACT3_HARD', 'ACT4_NORMAL'];
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
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
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

/**
 * runsMembers(공대별 캐릭 배열)를 기준으로
 * - dim === 'overall' : 공대별 "전체 평균 전투력" 표준편차
 * - dim === 'role'    : 공대별 "딜러 평균 + 서폿 평균"의 표준편차 합
 */
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

/**
 * 공대에 캐릭을 넣을 수 있는지 체크 (그리디 단계)
 * - 공대 인원 최대 8
 * - 같은 discordName은 같은 공대에 2번 불가
 * - 같은 딜러 직업군(jobCode)은 공대 내 허용 BUT "서로 다른 파티"여야만 함
 *   → 2파티라서 같은 DPS jobCode는 공대 내 최대 2명까지만 허용
 * - 서폿은 파티당 1명 × 2파티 → 공대 내 최대 2명
 */
function canAddToRunGreedy(
  runMembers: Character[],
  runPlayerCounts: Record<string, number>,
  ch: Character,
  maxPerRun: number,
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
    const supCount = runMembers.filter((m) => m.role === 'SUPPORT').length;
    if (supCount >= 2) return false;
  }

  return true;
}

/** 로컬서치(이동) 단계에서의 공대 수용 가능 체크 */
function canAddToRunLocalSearch(
  runMembers: Character[],
  ch: Character,
  maxPerRun: number,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  if (runMembers.some((m) => m.discordName === ch.discordName)) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;
    if (sameJob >= 2) return false;
  } else {
    const supCount = runMembers.filter((m) => m.role === 'SUPPORT').length;
    if (supCount >= 2) return false;
  }

  return true;
}

/**
 * 1차 그리디 배치 후, "표준편차 cost"를 줄이는 방향으로
 * 공대 간 캐릭터 이동을 반복해서 배치를 개선하는 함수.
 */
function optimizeRunsByStdDev(
  runsMembers: Character[][],
  maxPerRun: number,
  dim: BalanceDimension,
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
    const cIndex = Math.floor(Math.random() * allCharacters.length);
    const ch = allCharacters[cIndex];
    const from = charToRun[ch.id];
    if (from === undefined) continue;

    let to = Math.floor(Math.random() * runCount);
    let guard = 0;
    while (to === from && guard < 5) {
      to = Math.floor(Math.random() * runCount);
      guard++;
    }
    if (to === from) continue;

    const fromRun = runs[from];
    const toRun = runs[to];

    if (!canAddToRunLocalSearch(toRun, ch, maxPerRun)) continue;

    const idxInFrom = fromRun.findIndex((m) => m.id === ch.id);
    if (idxInFrom === -1) continue;

    // 이동 시도
    fromRun.splice(idxInFrom, 1);
    toRun.push(ch);

    const newCost = computeRunsCost(runs, dim);

    if (newCost <= bestCost) {
      bestCost = newCost;
      charToRun[ch.id] = to;
    } else {
      // 롤백
      toRun.pop();
      fromRun.splice(idxInFrom, 0, ch);
    }
  }

  return runs;
}

/**
 * ✅ 스피드 전용 최적화 (개선 버전)
 * 우선순위:
 * 1) (최우선) "앞 공대부터" 인원 채우기 (lexicographic by runIndex)
 * 2) (다음) 공대별 평균 전투력이 최대한 비슷하도록 (표준편차 + range 최소)
 * 3) (마지막) 가장 적은 인원 공대(들)의 평균이 전체 공대 평균 median에 가깝게
 *
 * 핵심: 1번을 먼저 만족시킨 뒤, 그 "인원 벡터"를 깨지 않는 선에서 swap으로 전투력을 퍼트림.
 */
function optimizeRunsForSpeed(
  runsMembers: Character[][],
  maxPerRun: number,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const lexBetter = (nextSizes: number[], curSizes: number[]) => {
    for (let i = 0; i < Math.min(nextSizes.length, curSizes.length); i++) {
      if (nextSizes[i] === curSizes[i]) continue;
      return nextSizes[i] > curSizes[i]; // 앞 공대 인원이 늘면 무조건 이득
    }
    return false;
  };

  const validRun = (run: Character[]) => {
    if (run.length > maxPerRun) return false;

    // discordName 중복 금지
    const names = new Set<string>();
    for (const m of run) {
      if (names.has(m.discordName)) return false;
      names.add(m.discordName);
    }

    // 서폿 <= 2
    const sup = run.filter((m) => m.role === 'SUPPORT').length;
    if (sup > 2) return false;

    // 딜 직업 동일 <= 2 (서로 다른 파티 전제)
    const dps = run.filter((m) => m.role === 'DPS');
    const cnt: Record<string, number> = {};
    for (const m of dps) {
      cnt[m.jobCode] = (cnt[m.jobCode] || 0) + 1;
      if (cnt[m.jobCode] > 2) return false;
    }

    return true;
  };

  const objective = (candidateRuns: Character[][]) => {
    const nonEmpty = candidateRuns.filter((r) => r.length > 0);
    const avgs = nonEmpty.map((r) => runAvg(r));
    const sd = std(avgs);

    const minAvg = avgs.length ? Math.min(...avgs) : 0;
    const maxAvg = avgs.length ? Math.max(...avgs) : 0;
    const range = maxAvg - minAvg;

    // 소인원 공대 median 근접 페널티
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

    // lex 이후 비교용 (sd -> range -> medPenalty)
    return { sd, range, medPenalty };
  };

  const betterObj = (
    a: { sd: number; range: number; medPenalty: number },
    b: { sd: number; range: number; medPenalty: number },
  ) => {
    if (a.sd !== b.sd) return a.sd < b.sd;
    if (a.range !== b.range) return a.range < b.range;
    return a.medPenalty < b.medPenalty;
  };

  // =========================
  // 1) 인원 채우기 우선 "move"
  // =========================
  const maxMoveIterations = runs.flat().length * 60;

  for (let iter = 0; iter < maxMoveIterations; iter++) {
    const curSizes = sizesByIndex(runs);

    let bestMove: {
      nextRuns: Character[][];
      nextObj: { sd: number; range: number; medPenalty: number };
    } | null = null;

    for (let from = 0; from < runCount; from++) {
      if (runs[from].length === 0) continue;

      for (let to = 0; to < runCount; to++) {
        if (to === from) continue;
        if (runs[to].length >= maxPerRun) continue;

        for (let ci = 0; ci < runs[from].length; ci++) {
          const ch = runs[from][ci];
          if (!canAddToRunLocalSearch(runs[to], ch, maxPerRun)) continue;

          const nextSizes = curSizes.slice();
          nextSizes[from] -= 1;
          nextSizes[to] += 1;

          // ✅ 인원수 최우선: lex 개선 move만 허용
          if (!lexBetter(nextSizes, curSizes)) continue;

          const nextRuns = runs.map((r) => r.slice());
          const picked = nextRuns[from].splice(ci, 1)[0];
          nextRuns[to].push(picked);

          // 제약 검증
          if (!validRun(nextRuns[from]) || !validRun(nextRuns[to])) continue;

          const nextObj = objective(nextRuns);

          if (!bestMove || betterObj(nextObj, bestMove.nextObj)) {
            bestMove = { nextRuns, nextObj };
          }
        }
      }
    }

    if (!bestMove) break;
    for (let i = 0; i < runCount; i++) runs[i] = bestMove.nextRuns[i];
  }

  // =========================
  // 2) 인원 벡터 고정 후, 평균 전투력 "퍼트리기"
  //    => swap 기반 (인원 유지)
  // =========================
  const fixedSizes = sizesByIndex(runs);
  let curObj = objective(runs);

  const maxSwapIterations = runs.flat().length * 120;

  for (let iter = 0; iter < maxSwapIterations; iter++) {
    let improved = false;

    // "센 공대(평균↑)"와 "약한 공대(평균↓)"를 먼저 찾고,
    // 그 둘 사이에서 스왑을 우선적으로 시도하면 몰림이 빠르게 풀림
    const avgs = runs.map((r) => (r.length ? runAvg(r) : -Infinity));
    const highIdx = avgs.indexOf(Math.max(...avgs));
    const lowIdx = avgs.indexOf(Math.min(...avgs.filter((v) => v > -Infinity)));

    const tryPairs: Array<[number, number]> = [];
    if (highIdx !== -1 && lowIdx !== -1 && highIdx !== lowIdx) {
      tryPairs.push([highIdx, lowIdx]);
    }
    // fallback로 전체 쌍도 탐색
    for (let a = 0; a < runCount; a++) {
      for (let b = a + 1; b < runCount; b++) {
        if (a === highIdx && b === lowIdx) continue;
        tryPairs.push([a, b]);
      }
    }

    outer: for (const [aIdx, bIdx] of tryPairs) {
      if (!runs[aIdx].length || !runs[bIdx].length) continue;

      for (let ai = 0; ai < runs[aIdx].length; ai++) {
        for (let bi = 0; bi < runs[bIdx].length; bi++) {
          const A = runs[aIdx][ai];
          const B = runs[bIdx][bi];

          const nextRuns = runs.map((r) => r.slice());
          nextRuns[aIdx].splice(ai, 1, B);
          nextRuns[bIdx].splice(bi, 1, A);

          // 인원 벡터 유지(스피드 1순위 보존)
          const nextSizes = sizesByIndex(nextRuns);
          let same = true;
          for (let k = 0; k < nextSizes.length; k++) {
            if (nextSizes[k] !== fixedSizes[k]) {
              same = false;
              break;
            }
          }
          if (!same) continue;

          // 제약 검증
          if (!validRun(nextRuns[aIdx]) || !validRun(nextRuns[bIdx])) continue;

          const nextObj = objective(nextRuns);

          // ✅ 2순위: 평균 비슷하게(sd/range) 먼저 개선
          if (betterObj(nextObj, curObj)) {
            for (let k = 0; k < runCount; k++) runs[k] = nextRuns[k];
            curObj = nextObj;
            improved = true;
            break outer;
          }
        }
      }
    }

    if (!improved) break;
  }

  return runs;
}


// 레이드별 캐릭터 묶기 (+ 제외 적용)
function groupCharactersByRaid(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
): RaidBucket[] {
  const map: Record<RaidId, Character[]> = {
    ACT3_HARD: [],
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  characters.forEach((ch) => {
    const raids = getRaidPlanForCharacter(ch.itemLevel);
    raids.forEach((raidId) => {
      const excludedList = exclusions[raidId];
      if (excludedList && excludedList.includes(ch.id)) return;
      map[raidId].push(ch);
    });
  });

  return (Object.keys(map) as RaidId[]).map((raidId) => ({
    raidId,
    characters: map[raidId].sort((a, b) => b.combatPower - a.combatPower),
  }));
}

// 공대(회차)로 배분 –
// 1) 공대 수 최소
// 2) 같은 디코 닉네임은 같은 공대에 2번 들어갈 수 없음
// 3) 표준편차 최소화 (overall / role)
// 4) ✅ speed 모드: "참가 인원수 최우선" + 소인원 공대 전투력 median 근접
function distributeCharactersIntoRuns(
  raidId: RaidId,
  characters: Character[],
  balanceMode: BalanceMode,
): RaidRun[] {
  if (characters.length === 0) return [];

  const maxPerRun = 8;
  const dim = getBalanceDimension(balanceMode);
  const speed = isSpeedMode(balanceMode);

  // 유저별 이 레이드에서 몇 캐릭인지 계산
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

  // 1차: 그리디 배치
  const runsMembers: Character[][] = Array.from({ length: runCount }, () => []);
  const runsTotalPower: number[] = Array(runCount).fill(0);
  const runsDpsPower: number[] = Array(runCount).fill(0);
  const runsSupPower: number[] = Array(runCount).fill(0);
  const runsPlayerCounts: Array<Record<string, number>> = Array.from(
    { length: runCount },
    () => ({}),
  );

  const sorted = [...characters].sort((a, b) => b.combatPower - a.combatPower);

  sorted.forEach((ch) => {
    let bestIndex = -1;
    let bestScore: [number, number] | null = null;

    for (let i = 0; i < runCount; i++) {
      if (!canAddToRunGreedy(runsMembers[i], runsPlayerCounts[i], ch, maxPerRun))
        continue;

      const size = runsMembers[i].length;

      const metric =
        dim === 'overall'
          ? runsTotalPower[i]
          : ch.role === 'DPS'
            ? runsDpsPower[i]
            : runsSupPower[i];

      // ✅ 기본: [metric(낮을수록), size(적을수록)]
      // ✅ speed: [-size(많을수록), metric(낮을수록)]  (그리디에서도 인원 우선)
      const score: [number, number] = speed ? [-size, metric] : [metric, size];

      if (!bestScore) {
        bestScore = score;
        bestIndex = i;
      } else {
        if (
          score[0] < bestScore[0] ||
          (score[0] === bestScore[0] && score[1] < bestScore[1])
        ) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    if (bestIndex === -1) {
      // fallback: 제약 때문에 어디도 못 가는 경우(최후)
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

    runsMembers[bestIndex].push(ch);
    runsTotalPower[bestIndex] += ch.combatPower;
    if (ch.role === 'DPS') {
      runsDpsPower[bestIndex] += ch.combatPower;
    } else {
      runsSupPower[bestIndex] += ch.combatPower;
    }
    runsPlayerCounts[bestIndex][ch.discordName] =
      (runsPlayerCounts[bestIndex][ch.discordName] || 0) + 1;
  });

  // 2차 최적화
  const optimizedRunsMembers = speed
    ? optimizeRunsForSpeed(runsMembers, maxPerRun) // ✅ 스피드 전용(인원 최우선)
    : optimizeRunsByStdDev(runsMembers, maxPerRun, dim); // 기존

  // 최종 공대 → 파티로 쪼개기
  const runs: RaidRun[] = [];

  optimizedRunsMembers.forEach((members, idx) => {
    if (members.length === 0) return;

    const parties = splitIntoParties(members);
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

// 공대 안에서 1~2파티 구성
function splitIntoParties(members: Character[]): RaidRunParty[] {
  const maxParties = 2;
  const maxPartySize = 4;
  const maxDpsPerParty = 3;
  const maxSupPerParty = 1;

  const supports = [...members]
    .filter((m) => m.role === 'SUPPORT')
    .sort((a, b) => b.combatPower - a.combatPower);
  const dps = [...members]
    .filter((m) => m.role === 'DPS')
    .sort((a, b) => b.combatPower - a.combatPower);

  const parties: RaidRunParty[] = Array.from({ length: maxParties }).map(
    (_, idx) => ({
      partyIndex: idx + 1,
      members: [],
    }),
  );

  const party1 = parties[0];
  const party2 = parties[1];

  const usedIds = new Set<string>();

  const addMemberToParty = (party: RaidRunParty | undefined, c: Character) => {
    if (!party) return;
    if (usedIds.has(c.id)) return;
    if (party.members.length >= maxPartySize) return;
    party.members.push(c);
    usedIds.add(c.id);
  };

  // 1) 파티1(쎈 파티): 가장 쎈 서폿
  if (supports.length > 0) {
    addMemberToParty(party1, supports[0]);
  }

  // 2) 파티1: 가장 쎈 딜러로 직업 안 겹치게 3명까지 채우기
  for (const d of dps) {
    if (usedIds.has(d.id)) continue;

    const dpsCountInP1 = party1.members.filter((m) => m.role === 'DPS').length;
    if (dpsCountInP1 >= maxDpsPerParty) break;

    const hasSameJobInP1 = party1.members.some(
      (m) => m.role === 'DPS' && m.jobCode === d.jobCode,
    );
    if (hasSameJobInP1) continue;

    addMemberToParty(party1, d);
  }

  // 3) 파티2: 남은 서폿 중 1명
  if (party2) {
    const remainingSupports = supports.filter((s) => !usedIds.has(s.id));
    if (remainingSupports.length > 0) {
      const supCountInP2 = party2.members.filter(
        (m) => m.role === 'SUPPORT',
      ).length;
      if (supCountInP2 < maxSupPerParty) {
        addMemberToParty(party2, remainingSupports[0]);
      }
    }
  }

  // 4) 파티2: 남은 서폿 더 있으면 자리 허용 범위까지
  if (party2) {
    const moreSupports = supports.filter((s) => !usedIds.has(s.id));
    for (const sp of moreSupports) {
      const supCountInP2 = party2.members.filter(
        (m) => m.role === 'SUPPORT',
      ).length;
      if (supCountInP2 >= maxSupPerParty) break;
      addMemberToParty(party2, sp);
    }
  }

  // 5) 파티2: 남은 딜러들로 채우기 (직업 중복 X, 3명까지)
  if (party2) {
    const remainingDps = dps.filter((d) => !usedIds.has(d.id));
    for (const d of remainingDps) {
      const dpsCountInP2 = party2.members.filter(
        (m) => m.role === 'DPS',
      ).length;
      if (dpsCountInP2 >= maxDpsPerParty) break;

      const hasSameJobInP2 = party2.members.some(
        (m) => m.role === 'DPS' && m.jobCode === d.jobCode,
      );
      if (hasSameJobInP2) continue;

      addMemberToParty(party2, d);
    }
  }

  return parties.filter((p) => p.members.length > 0);
}

// 전체 레이드 일정 생성 (+ 제외 반영 + 모드 반영)
export function buildRaidSchedule(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  balanceMode: BalanceMode = 'overall',
): RaidSchedule {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered, exclusions);

  const schedule: RaidSchedule = {
    ACT3_HARD: [],
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  buckets.forEach(({ raidId, characters }) => {
    schedule[raidId] = distributeCharactersIntoRuns(
      raidId,
      characters,
      balanceMode,
    );
  });

  return schedule;
}
