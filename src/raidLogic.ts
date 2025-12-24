import type {
  Character,
  RaidId,
  RaidRun,
  RaidRunParty,
  RaidSchedule,
  RaidExclusionMap,
} from './types';

// ✅ 시드 기반 난수 생성기 (Seeded RNG) - Mulberry32 알고리즘
// 시드(seed)가 같으면 항상 동일한 순서의 난수를 반환합니다.
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

export function getRaidPlanForCharacter(itemLevel: number): RaidId[] {
  if (itemLevel >= 1730) return ['ACT3_HARD', 'ACT4_HARD', 'FINAL_HARD'];
  if (itemLevel >= 1720) return ['ACT3_HARD', 'ACT4_HARD', 'FINAL_NORMAL'];
  if (itemLevel >= 1710) return ['ACT3_HARD', 'ACT4_NORMAL', 'FINAL_NORMAL'];
  if (itemLevel >= 1700) return ['ACT3_HARD', 'ACT4_NORMAL'];
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
 * ✅ 수정됨: random 함수를 인자로 받아 사용 (Math.random 대체)
 */
function optimizeRunsByStdDev(
  runsMembers: Character[][],
  maxPerRun: number,
  dim: BalanceDimension,
  random: () => number, // 주입된 랜덤 함수
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
    // Math.random() -> random()
    const cIndex = Math.floor(random() * allCharacters.length);
    const ch = allCharacters[cIndex];
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

    if (!canAddToRunLocalSearch(toRun, ch, maxPerRun)) continue;

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

function optimizeRunsForSpeed(
  runsMembers: Character[][],
  maxPerRun: number,
): Character[][] {
  // 스피드 모드는 원래 Math.random을 쓰지 않고 결정론적(deterministic) 루프를 돌므로
  // 입력 배열의 순서만 고정되면 결과가 같습니다.
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const totalPlayers = new Set(runs.flat().map((c) => c.discordName)).size;

  const speedVector = (candidateRuns: Character[][]) => {
    const sizes = sizesByIndex(candidateRuns);
    const fullCount = sizes.filter((s) => s >= totalPlayers).length;
    return [fullCount, ...sizes];
  };

  const lexBetterVec = (nextVec: number[], curVec: number[]) => {
    for (let i = 0; i < Math.min(nextVec.length, curVec.length); i++) {
      if (nextVec[i] === curVec[i]) continue;
      return nextVec[i] > curVec[i];
    }
    return false;
  };

  const validRun = (run: Character[]) => {
    if (run.length > maxPerRun) return false;
    const names = new Set<string>();
    for (const m of run) {
      if (names.has(m.discordName)) return false;
      names.add(m.discordName);
    }
    const sup = run.filter((m) => m.role === 'SUPPORT').length;
    if (sup > 2) return false;
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

  const maxMoveIterations = runs.flat().length * 60;
  for (let iter = 0; iter < maxMoveIterations; iter++) {
    const curVec = speedVector(runs);
    let bestMove: {
      nextRuns: Character[][];
      nextObj: { sd: number; range: number; medPenalty: number };
      nextVec: number[];
    } | null = null;

    for (let from = 0; from < runCount; from++) {
      if (runs[from].length === 0) continue;
      for (let to = 0; to < runCount; to++) {
        if (to === from) continue;
        if (runs[to].length >= maxPerRun) continue;
        for (let ci = 0; ci < runs[from].length; ci++) {
          const ch = runs[from][ci];
          if (!canAddToRunLocalSearch(runs[to], ch, maxPerRun)) continue;
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
    const avgs = runs.map((r) => (r.length ? runAvg(r) : -Infinity));
    const highIdx = avgs.indexOf(Math.max(...avgs));
    const lowIdx = avgs.indexOf(Math.min(...avgs.filter((v) => v > -Infinity)));
    const tryPairs: Array<[number, number]> = [];
    if (highIdx !== -1 && lowIdx !== -1 && highIdx !== lowIdx) {
      tryPairs.push([highIdx, lowIdx]);
    }
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
    // ✅ 정렬 안정성 확보: CombatPower가 같으면 ID로 정렬
    characters: map[raidId].sort(
      (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
    ),
  }));
}

type SpeedSeedResult = {
  K: number;
  remaining: Character[];
};

function seedFullRunsForSpeed(
  characters: Character[],
  maxPerRun: number,
  runCount: number,
  runsMembers: Character[][],
  runsTotalPower: number[],
  runsDpsPower: number[],
  runsSupPower: number[],
  runsPlayerCounts: Array<Record<string, number>>,
): SpeedSeedResult {
  const perPlayer: Record<string, Character[]> = {};
  for (const ch of characters) (perPlayer[ch.discordName] ||= []).push(ch);
  const players = Object.keys(perPlayer).sort(); // ✅ 플레이어 키 순서 고정

  if (players.length > maxPerRun) {
    return {
      K: 0,
      remaining: [...characters].sort(
        (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
      ),
    };
  }

  // ✅ 버킷 내부 정렬도 고정
  players.forEach((p) =>
    perPlayer[p].sort(
      (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
    ),
  );

  const initialK = Math.min(
    ...players.map((p) => perPlayer[p].length),
    runCount,
  );

  const totalCp = characters.reduce((s, c) => s + c.combatPower, 0);
  const globalAvg = totalCp / Math.max(1, characters.length);

  const tryBuild = (K: number): { ok: boolean; remaining: Character[] } => {
    const backupMembers = runsMembers.map((r) => r.slice());
    const backupTotal = runsTotalPower.slice();
    const backupDps = runsDpsPower.slice();
    const backupSup = runsSupPower.slice();
    const backupCounts = runsPlayerCounts.map((m) => ({ ...m }));

    const buckets: Record<string, Character[]> = {};
    for (const p of players) buckets[p] = perPlayer[p].slice();

    for (let ri = 0; ri < K; ri++) {
      for (const p of players) {
        const bucket = buckets[p];
        let bestIdx = -1;
        let bestScore = Infinity;
        const curTotal = runsMembers[ri].reduce((s, m) => s + m.combatPower, 0);
        const curLen = runsMembers[ri].length;

        for (let ci = 0; ci < bucket.length; ci++) {
          const cand = bucket[ci];
          if (
            !canAddToRunGreedy(
              runsMembers[ri],
              runsPlayerCounts[ri],
              cand,
              maxPerRun,
            )
          )
            continue;
          const nextAvg = (curTotal + cand.combatPower) / (curLen + 1);
          const score = Math.abs(nextAvg - globalAvg);
          if (score < bestScore) {
            bestScore = score;
            bestIdx = ci;
          }
        }
        if (bestIdx === -1) {
          for (let i = 0; i < runCount; i++)
            runsMembers[i] = backupMembers[i];
          for (let i = 0; i < runCount; i++)
            runsTotalPower[i] = backupTotal[i];
          for (let i = 0; i < runCount; i++) runsDpsPower[i] = backupDps[i];
          for (let i = 0; i < runCount; i++) runsSupPower[i] = backupSup[i];
          for (let i = 0; i < runCount; i++)
            runsPlayerCounts[i] = backupCounts[i];
          return { ok: false, remaining: [] };
        }
        const picked = bucket.splice(bestIdx, 1)[0];
        runsMembers[ri].push(picked);
        runsTotalPower[ri] += picked.combatPower;
        if (picked.role === 'DPS') runsDpsPower[ri] += picked.combatPower;
        else runsSupPower[ri] += picked.combatPower;
        runsPlayerCounts[ri][picked.discordName] =
          (runsPlayerCounts[ri][picked.discordName] || 0) + 1;
      }
    }
    const remaining = players.flatMap((p) => buckets[p]);
    remaining.sort(
      (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
    );
    return { ok: true, remaining };
  };

  for (let K = initialK; K >= 1; K--) {
    const built = tryBuild(K);
    if (built.ok) return { K, remaining: built.remaining };
  }

  const remaining = [...characters].sort(
    (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
  );
  return { K: 0, remaining };
}

function distributeCharactersIntoRuns(
  raidId: RaidId,
  characters: Character[],
  balanceMode: BalanceMode,
  random: () => number, // ✅ random 함수 주입
): RaidRun[] {
  if (characters.length === 0) return [];

  const maxPerRun = 8;
  const dim = getBalanceDimension(balanceMode);
  const speed = isSpeedMode(balanceMode);

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

  // ✅ 정렬 안정성 확보
  let sorted: Character[] = [...characters].sort(
    (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
  );
  let seededK = 0;

  if (speed) {
    const seeded = seedFullRunsForSpeed(
      sorted,
      maxPerRun,
      runCount,
      runsMembers,
      runsTotalPower,
      runsDpsPower,
      runsSupPower,
      runsPlayerCounts,
    );
    seededK = seeded.K;
    sorted = seeded.remaining;
  }

  sorted.forEach((ch) => {
    let bestIndex = -1;
    let bestScore: [number, number, number] | null = null;
    const start = speed && seededK > 0 ? seededK : 0;

    for (let i = start; i < runCount; i++) {
      if (!canAddToRunGreedy(runsMembers[i], runsPlayerCounts[i], ch, maxPerRun))
        continue;
      const size = runsMembers[i].length;
      const metric =
        dim === 'overall'
          ? runsTotalPower[i]
          : ch.role === 'DPS'
          ? runsDpsPower[i]
          : runsSupPower[i];
      const score: [number, number, number] =
        speed && seededK > 0
          ? [size, metric, i]
          : speed
          ? [-size, metric, i]
          : [metric, size, i];

      if (!bestScore) {
        bestScore = score;
        bestIndex = i;
      } else {
        if (
          score[0] < bestScore[0] ||
          (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
          (score[0] === bestScore[0] &&
            score[1] === bestScore[1] &&
            score[2] < bestScore[2])
        ) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    if (bestIndex === -1) {
      for (let i = 0; i < runCount; i++) {
        if (
          !canAddToRunGreedy(runsMembers[i], runsPlayerCounts[i], ch, maxPerRun)
        )
          continue;
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
            (score[0] === bestScore[0] &&
              score[1] === bestScore[1] &&
              score[2] < bestScore[2])
          ) {
            bestScore = score;
            bestIndex = i;
          }
        }
      }
    }

    if (bestIndex === -1) {
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

  // ✅ random 함수 전달
  const optimizedRunsMembers = speed
    ? optimizeRunsForSpeed(runsMembers, maxPerRun)
    : optimizeRunsByStdDev(runsMembers, maxPerRun, dim, random);

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

function splitIntoParties(members: Character[]): RaidRunParty[] {
  const maxParties = 2;
  const maxPartySize = 4;
  const maxDpsPerParty = 3;
  const maxSupPerParty = 1;

  // ✅ 정렬 안정성 확보
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

  if (supports.length > 0) {
    addMemberToParty(party1, supports[0]);
  }
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
  if (party2) {
    const remainingDps = dps.filter((d) => !usedIds.has(d.id));
    for (const d of remainingDps) {
      const dpsCountInP2 = party2.members.filter((m) => m.role === 'DPS').length;
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

// ✅ 메인 함수: Seed 적용
export function buildRaidSchedule(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  balanceMode: BalanceMode = 'overall',
): RaidSchedule {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered, exclusions);

  // ✅ 고정된 시드 값 사용 (원하는 경우 날짜별로 바꾸거나 할 수 있음)
  // 여기서는 123456789로 고정하여 항상 동일 결과 보장
  const SEED = 123456789;
  
  // 만약 날짜별로 시드를 다르게 하고 싶다면 아래 주석 해제
  // const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // const SEED = parseInt(todayStr, 10);

  const seededRng = createSeededRandom(SEED);

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
      seededRng, // ✅ RNG 전달
    );
  });

  return schedule;
}