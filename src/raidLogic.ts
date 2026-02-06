import type {
  Character,
  RaidId,
  RaidRun,
  RaidRunParty,
  RaidSchedule,
  RaidExclusionMap,
  RaidSettingsMap,
  RaidSwap,
} from './types';

// ==============================
// 🔧 타입 보정: members가 []/never[]로 정의되어 있어도
// 이 파일 내부에서는 Character[]로 강제해서 never 에러 제거
// ==============================
type FixedRaidRunParty = Omit<RaidRunParty, 'members'> & { members: Character[] };

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

function isSerkaRaid(raidId: RaidId): boolean {
  return (
    raidId === 'SERKA_NORMAL' ||
    raidId === 'SERKA_HARD' ||
    raidId === 'SERKA_NIGHTMARE'
  );
}

type RaidConfig = {
  maxPerRun: number; // 한 런의 총 인원
  maxSupportsPerRun: number; // 한 런에서 서폿 최대
  maxParties: number; // 런 내 파티 수
};

function getRaidConfig(raidId: RaidId): RaidConfig {
  // ✅ 세르카: 4인(딜3+서폿1), 1파티
  if (isSerkaRaid(raidId)) {
    return { maxPerRun: 4, maxSupportsPerRun: 1, maxParties: 1 };
  }
  // ✅ 그 외(4막, 종막): 8인(4+4), 2파티 (공격대 서폿 2명까지 OK)
  return { maxPerRun: 8, maxSupportsPerRun: 2, maxParties: 2 };
}

function getEffectiveMaxPerRun(raidId: RaidId, characters: Character[]): number {
  const cfg = getRaidConfig(raidId);
  const uniqueUsers = new Set(characters.map((c) => c.discordName)).size;
  return Math.max(1, Math.min(cfg.maxPerRun, uniqueUsers));
}

function estimateRunCount(raidId: RaidId, characters: Character[]): number {
  if (characters.length === 0) return 0;
  const cfg = getRaidConfig(raidId);
  const maxPerRun = cfg.maxPerRun;

  const perPlayerCount: Record<string, number> = {};
  let supportCount = 0;

  characters.forEach((ch) => {
    perPlayerCount[ch.discordName] = (perPlayerCount[ch.discordName] || 0) + 1;
    if (ch.role === 'SUPPORT') supportCount++;
  });

  const maxCharsForOnePlayer = Object.values(perPlayerCount).reduce(
    (max, v) => (v > max ? v : max),
    0,
  );

  const baseRunsBySize = Math.ceil(characters.length / maxPerRun);
  const runsBySupport = Math.ceil(supportCount / cfg.maxSupportsPerRun);

  return Math.max(baseRunsBySize, maxCharsForOnePlayer || 1, runsBySupport);
}

function promoteValkyToSupportIfNeeded(
  raidId: RaidId,
  characters: Character[],
): Character[] {
  const cfg = getRaidConfig(raidId);

  const candidates = characters
    .filter(
      (c) =>
        c.jobCode === '발키리' &&
        c.role === 'DPS' &&
        c.valkyCanSupport === true,
    )
    .slice()
    .sort(
      (a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id),
    );

  if (candidates.length === 0) return characters;

  const runCount = estimateRunCount(raidId, characters);
  const requiredSupports = runCount * cfg.maxSupportsPerRun;
  const existingSupports = characters.filter((c) => c.role === 'SUPPORT').length;

  const need = requiredSupports - existingSupports;
  if (need <= 0) return characters;

  const promote = candidates.slice(0, need);
  const promoteIds = new Set(promote.map((c) => c.id));

  return characters.map((c) =>
    promoteIds.has(c.id) ? { ...c, role: 'SUPPORT' } : c,
  );
}

// ==========================================
// ✅ 레이드 선택 로직
// ==========================================
function getTargetRaidsForCharacter(ch: Character): RaidId[] {
  const il = ch.itemLevel;
  const raids: RaidId[] = [];

  // 1) 세르카
  if (il >= 1740 && ch.serkaNightmare === true) raids.push('SERKA_NIGHTMARE');
  else if (il >= 1730) raids.push('SERKA_HARD');
  else if (il >= 1710) raids.push('SERKA_NORMAL');

  // 2) 종막
  if (il >= 1730) raids.push('FINAL_HARD');
  else if (il >= 1710) raids.push('FINAL_NORMAL');

  // 3) 4막
  if (il >= 1720) raids.push('ACT4_HARD');
  else if (il >= 1700) raids.push('ACT4_NORMAL');

  return raids;
}

interface RaidBucket {
  raidId: RaidId;
  characters: Character[];
}

function std(values: number[]): number {
  const arr = values.filter((v) => Number.isFinite(v));
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / arr.length;
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

function computeRunsCost(runsMembers: Character[][], dim: BalanceDimension): number {
  const nonEmpty = runsMembers.filter((r) => r.length > 0);
  if (nonEmpty.length <= 1) return 0;

  if (dim === 'overall') {
    const overallAvgs = nonEmpty.map((run) => runAvg(run));
    return std(overallAvgs);
  }

  const dpsAvgs: number[] = [];
  const supAvgs: number[] = [];

  nonEmpty.forEach((run) => {
    let dpsSum = 0, dpsCnt = 0, supSum = 0, supCnt = 0;

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
 * ✅ [SERKA 전용 안전장치]
 * - 세르카는 4인 1파티라서 "서폿이 존재하는데 4딜 4/4" 조합이 나오면 안 됨
 * - 따라서 (세르카 + 서폿이 풀에 존재) 시: "서폿 없는 런은 3명까지만 채우고 마지막 1칸은 서폿 예약"
 */
function shouldReserveLastSlotForSupport(
  raidId: RaidId,
  maxPerRun: number,
  maxSupportsPerRun: number,
  supportCountInPool: number,
) {
  return (
    isSerkaRaid(raidId) &&
    maxPerRun === 4 &&
    maxSupportsPerRun === 1 &&
    supportCountInPool > 0
  );
}

/**
 * ✅ 세르카 서폿 부족 시 규칙:
 * - 서폿이 "없는" 런은 딜러 3명까지만(= 런 총 3명 cap)
 * - 서폿이 들어간 런만 4인(서폿1+딜3) 가능
 */
function getMaxMembersWhenNoSupportInRun(raidId: RaidId): number {
  return isSerkaRaid(raidId) ? 3 : Number.POSITIVE_INFINITY;
}

/**
 * ✅ 세르카 직업 중복 규칙:
 * - 세르카(4인): 같은 직업 DPS는 최대 1명(=중복 2명 이상 금지)
 * - 그 외(8인): 같은 직업 DPS는 최대 2명(기존 유지)
 */
function getMaxSameJobDpsInRun(raidId: RaidId): number {
  return isSerkaRaid(raidId) ? 1 : 2;
}

function canAddToRunGreedy(
  raidId: RaidId,
  runMembers: Character[],
  runPlayerCounts: Record<string, number>,
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
  reserveLastSlotForSupport: boolean = false,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  if (runPlayerCounts[ch.discordName]) return false;

  const supCountNow = runMembers.filter((m) => m.role === 'SUPPORT').length;

  if (ch.role === 'DPS') {
    // ✅ [SERKA] 서폿 없는 런은 최대 3명까지만(딜3)
    const maxNoSup = getMaxMembersWhenNoSupportInRun(raidId);
    if (supCountNow === 0 && runMembers.length >= maxNoSup) return false;

    // ✅ [SERKA] 4딜 4/4 방지(기존)
    if (reserveLastSlotForSupport) {
      const remainingSlots = maxPerRun - runMembers.length;
      if (supCountNow === 0 && remainingSlots === 1) return false;
    }

    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;

    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);
    if (sameJob >= maxSameJobDps) return false;
  } else {
    // SUPPORT
    if (supCountNow >= maxSupportsPerRun) return false;
  }

  return true;
}

function canAddToRunLocalSearch(
  raidId: RaidId,
  runMembers: Character[],
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
  reserveLastSlotForSupport: boolean = false,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  if (runMembers.some((m) => m.discordName === ch.discordName)) return false;

  const supCountNow = runMembers.filter((m) => m.role === 'SUPPORT').length;

  if (ch.role === 'DPS') {
    // ✅ [SERKA] 서폿 없는 런은 최대 3명까지만(딜3)
    const maxNoSup = getMaxMembersWhenNoSupportInRun(raidId);
    if (supCountNow === 0 && runMembers.length >= maxNoSup) return false;

    // ✅ [SERKA] 4딜 4/4 방지(기존)
    if (reserveLastSlotForSupport) {
      const remainingSlots = maxPerRun - runMembers.length;
      if (supCountNow === 0 && remainingSlots === 1) return false;
    }

    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;

    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);
    if (sameJob >= maxSameJobDps) return false;
  } else {
    if (supCountNow >= maxSupportsPerRun) return false;
  }

  return true;
}

/**
 * ⚖️ [Balance Mode] 인원 이동(Move)까지 포함한 최적화
 */
function optimizeRunsByStdDev(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  dim: BalanceDimension,
  random: () => number,
  lockIds: Set<string> = new Set(),
  reserveLastSlotForSupport: boolean = false,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const charToRun: Record<string, number> = {};
  runs.forEach((run, ri) => run.forEach((c) => (charToRun[c.id] = ri)));

  const allCharacters: Character[] = runs.flat();
  if (allCharacters.length === 0) return runs;

  let bestCost = computeRunsCost(runs, dim);
  const maxIterations = allCharacters.length * 40;

  for (let iter = 0; iter < maxIterations; iter++) {
    const cIndex = Math.floor(random() * allCharacters.length);
    const ch = allCharacters[cIndex];
    if (lockIds.has(ch.id)) continue;

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

    if (
      !canAddToRunLocalSearch(
        raidId,
        toRun,
        ch,
        maxPerRun,
        maxSupportsPerRun,
        reserveLastSlotForSupport,
      )
    )
      continue;

    const idxInFrom = fromRun.findIndex((m) => m.id === ch.id);
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
 * ⚡️ [Speed Mode] 인원 수 유지(Swap Only) 최적화
 */
function optimizeCombatPowerBySwapOnly(
  raidId: RaidId,
  runsMembers: Character[][],
  maxSupportsPerRun: number,
  dim: BalanceDimension,
  random: () => number,
  lockIds: Set<string> = new Set(),
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  let bestCost = computeRunsCost(runs, dim);
  const maxIterations = runs.flat().length * 100;

  const maxSameJobDps = getMaxSameJobDpsInRun(raidId);

  for (let iter = 0; iter < maxIterations; iter++) {
    const r1 = Math.floor(random() * runCount);
    const r2 = Math.floor(random() * runCount);
    if (r1 === r2) continue;
    if (runs[r1].length === 0 || runs[r2].length === 0) continue;

    const c1Idx = Math.floor(random() * runs[r1].length);
    const c2Idx = Math.floor(random() * runs[r2].length);
    const char1 = runs[r1][c1Idx];
    const char2 = runs[r2][c2Idx];

    if (lockIds.has(char1.id) || lockIds.has(char2.id)) continue;
    if (char1.role !== char2.role) continue;

    const canSwap = (toRun: Character[], cFrom: Character, cTo: Character) => {
      const isDuplicateName = toRun.some(
        (m) => m.id !== cTo.id && m.discordName === cFrom.discordName,
      );
      if (isDuplicateName) return false;

      if (cFrom.role === 'DPS') {
        const sameJobCount = toRun.filter(
          (m) =>
            m.id !== cTo.id &&
            m.role === 'DPS' &&
            m.jobCode === cFrom.jobCode,
        ).length;

        if (sameJobCount >= maxSameJobDps) return false;
      } else {
        const supCount = toRun.filter(
          (m) => m.id !== cTo.id && m.role === 'SUPPORT',
        ).length;
        if (supCount >= maxSupportsPerRun) return false;
      }
      return true;
    };

    if (!canSwap(runs[r2], char1, char2)) continue;
    if (!canSwap(runs[r1], char2, char1)) continue;

    runs[r1][c1Idx] = char2;
    runs[r2][c2Idx] = char1;

    const newCost = computeRunsCost(runs, dim);
    if (newCost < bestCost) bestCost = newCost;
    else {
      runs[r1][c1Idx] = char1;
      runs[r2][c2Idx] = char2;
    }
  }

  return runs;
}

/**
 * ✅ speed 모드에서 "앞 런부터 최대한 꽉 채우기" 압축(Front-load Compaction)
 */
function compactRunsFrontloadedForSpeed(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  reserveLastSlotForSupport: boolean = false,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);

  const buildPlayerCounts = (members: Character[]) => {
    const counts: Record<string, number> = {};
    members.forEach((m) => (counts[m.discordName] = (counts[m.discordName] || 0) + 1));
    return counts;
  };

  for (let i = 0; i < runs.length; i++) {
    while (runs[i].length < maxPerRun) {
      let moved = false;
      const countsI = buildPlayerCounts(runs[i]);

      for (let j = runs.length - 1; j > i; j--) {
        if (runs[j].length === 0) continue;

        const candidates = [...runs[j]].sort(
          (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
        );

        for (const ch of candidates) {
          if (
            !canAddToRunGreedy(
              raidId,
              runs[i],
              countsI,
              ch,
              maxPerRun,
              maxSupportsPerRun,
              reserveLastSlotForSupport,
            )
          )
            continue;

          runs[j] = runs[j].filter((m) => m.id !== ch.id);
          runs[i].push(ch);
          moved = true;
          break;
        }

        if (moved) break;
      }

      if (!moved) break;
    }
  }

  return runs;
}

function adjustSoloLastRunStrongCharacter(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  lockIds: Set<string>,
  reserveLastSlotForSupport: boolean = false,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const buildPlayerCounts = (members: Character[]) => {
    const counts: Record<string, number> = {};
    members.forEach((m) => (counts[m.discordName] = (counts[m.discordName] || 0) + 1));
    return counts;
  };

  const runAverages: number[] = runs.map((members) => {
    if (members.length === 0) return 0;
    const total = members.reduce((sum, c) => sum + c.combatPower, 0);
    return total / members.length;
  });

  for (let soloRunIdx = 0; soloRunIdx < runCount; soloRunIdx++) {
    const soloRun = runs[soloRunIdx];
    if (soloRun.length !== 1) continue;

    const solo = soloRun[0];
    if (lockIds.has(solo.id)) continue;

    const otherAverages: number[] = [];
    for (let i = 0; i < runCount; i++) {
      if (i === soloRunIdx) continue;
      if (runs[i].length === 0) continue;
      otherAverages.push(runAverages[i]);
    }
    if (otherAverages.length === 0) continue;

    const threshold =
      otherAverages.reduce((sum, v) => sum + v, 0) / otherAverages.length;

    type Candidate = { runIndex: number; charIndex: number; ch: Character };
    const candidates: Candidate[] = [];

    for (let ri = 0; ri < runCount; ri++) {
      if (ri === soloRunIdx) continue;
      const members = runs[ri];

      for (let ci = 0; ci < members.length; ci++) {
        const ch = members[ci];
        if (lockIds.has(ch.id)) continue;
        if (ch.discordName !== solo.discordName) continue;
        if (ch.combatPower >= threshold)
          candidates.push({ runIndex: ri, charIndex: ci, ch });
      }
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.ch.combatPower - b.ch.combatPower);

    for (const cand of candidates) {
      const { runIndex: donorRunIdx, charIndex: donorCharIdx, ch: donorChar } =
        cand;

      const soloRunMembers = runs[soloRunIdx];
      const donorRunMembers = runs[donorRunIdx];

      if (soloRunMembers.length !== 1 || donorCharIdx >= donorRunMembers.length)
        continue;

      const originalSolo = soloRunMembers[0];

      const soloRunWithoutSolo: Character[] = [];
      const donorRunWithoutDonor = donorRunMembers.filter(
        (_, idx) => idx !== donorCharIdx,
      );

      const soloCountsAfter = buildPlayerCounts(soloRunWithoutSolo);
      const donorCountsAfter = buildPlayerCounts(donorRunWithoutDonor);

      const canPlaceDonorInSolo = canAddToRunGreedy(
        raidId,
        soloRunWithoutSolo,
        soloCountsAfter,
        donorChar,
        maxPerRun,
        maxSupportsPerRun,
        reserveLastSlotForSupport,
      );

      const canPlaceSoloInDonor = canAddToRunGreedy(
        raidId,
        donorRunWithoutDonor,
        donorCountsAfter,
        originalSolo,
        maxPerRun,
        maxSupportsPerRun,
        reserveLastSlotForSupport,
      );

      if (!canPlaceDonorInSolo || !canPlaceSoloInDonor) continue;

      soloRunMembers.length = 0;
      soloRunMembers.push(donorChar);
      donorRunMembers.splice(donorCharIdx, 1, originalSolo);

      runAverages[soloRunIdx] = donorChar.combatPower;
      const donorTotal = donorRunMembers.reduce((sum, c) => sum + c.combatPower, 0);
      runAverages[donorRunIdx] = donorTotal / donorRunMembers.length;

      break;
    }
  }

  return runs;
}

function minimizeSameJobInRuns(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  reserveLastSlotForSupport: boolean = false,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const dupThreshold = isSerkaRaid(raidId) ? 2 : 3;
  const keepUntil = isSerkaRaid(raidId) ? 1 : 2;
  const targetMaxSameJob = getMaxSameJobDpsInRun(raidId);

  const buildPlayerCounts = (members: Character[]) => {
    const counts: Record<string, number> = {};
    members.forEach((m) => (counts[m.discordName] = (counts[m.discordName] || 0) + 1));
    return counts;
  };

  for (let ri = 0; ri < runCount; ri++) {
    const run = runs[ri];
    if (!run.length) continue;

    const jobCounts: Record<string, number> = {};
    run.forEach((c) => {
      if (c.role !== 'DPS') return;
      jobCounts[c.jobCode] = (jobCounts[c.jobCode] || 0) + 1;
    });

    const duplicatedJobCodes = Object.keys(jobCounts).filter((job) => jobCounts[job] >= dupThreshold);
    if (duplicatedJobCodes.length === 0) continue;

    for (const ch of [...run]) {
      if (ch.role !== 'DPS') continue;
      if (!duplicatedJobCodes.includes(ch.jobCode)) continue;
      if (jobCounts[ch.jobCode] <= keepUntil) continue;

      for (let targetIdx = 0; targetIdx < runCount; targetIdx++) {
        if (targetIdx === ri) continue;

        const targetRun = runs[targetIdx];
        const sameJobInTargetCount = targetRun.filter(
          (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
        ).length;

        if (sameJobInTargetCount >= targetMaxSameJob) continue;

        const targetCounts = buildPlayerCounts(targetRun);

        if (
          !canAddToRunGreedy(
            raidId,
            targetRun,
            targetCounts,
            ch,
            maxPerRun,
            maxSupportsPerRun,
            reserveLastSlotForSupport,
          )
        )
          continue;

        const idxInSrc = run.findIndex((m) => m.id === ch.id);
        if (idxInSrc === -1) break;

        run.splice(idxInSrc, 1);
        targetRun.push(ch);

        jobCounts[ch.jobCode]--;
        break;
      }
    }
  }

  return runs;
}

// ✅ 같은 유저의 캐릭터끼리 스왑해서 직업 중복을 해결하는 로직 (전투력 고려)
function swapSameUserCharactersToFixDuplicates(
  raidId: RaidId,
  runsMembers: Character[][],
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const dupThreshold = isSerkaRaid(raidId) ? 2 : 3;

  for (let ri = 0; ri < runCount; ri++) {
    const run = runs[ri];
    if (!run.length) continue;

    const jobCounts: Record<string, number> = {};
    run.forEach((c) => {
      if (c.role !== 'DPS') return;
      jobCounts[c.jobCode] = (jobCounts[c.jobCode] || 0) + 1;
    });

    const dupJobs = Object.keys(jobCounts).filter((j) => jobCounts[j] >= dupThreshold);
    if (dupJobs.length === 0) continue;

    for (const ch of [...run]) {
      if (ch.role !== 'DPS') continue;
      if (!dupJobs.includes(ch.jobCode)) continue;

      type SwapCandidate = { runIdx: number; charIdx: number; char: Character };
      const candidates: SwapCandidate[] = [];

      for (let targetRi = 0; targetRi < runCount; targetRi++) {
        if (targetRi === ri) continue;
        const targetRun = runs[targetRi];

        for (let tIdx = 0; tIdx < targetRun.length; tIdx++) {
          const t = targetRun[tIdx];

          if (t.discordName !== ch.discordName) continue;
          if (t.id === ch.id) continue;
          if (t.role !== 'DPS') continue;

          const hasMyJobInTarget = targetRun.some(
            (m) => m.id !== t.id && m.jobCode === ch.jobCode,
          );
          if (hasMyJobInTarget) continue;

          const hasTargetJobInSource = run.some(
            (m) => m.id !== ch.id && m.jobCode === t.jobCode,
          );
          if (hasTargetJobInSource) continue;

          candidates.push({ runIdx: targetRi, charIdx: tIdx, char: t });
        }
      }

      if (candidates.length === 0) continue;

      let bestCand: SwapCandidate | null = null;
      let minDiff = Infinity;

      for (const cand of candidates) {
        const diff = Math.abs(ch.combatPower - cand.char.combatPower);
        if (diff < minDiff) {
          minDiff = diff;
          bestCand = cand;
        }
      }
      if (!bestCand) continue;

      const targetRun = runs[bestCand.runIdx];
      const myIdx = run.findIndex((m) => m.id === ch.id);
      if (myIdx === -1) continue;
      if (bestCand.charIdx < 0 || bestCand.charIdx >= targetRun.length) continue;

      const targetChar = targetRun[bestCand.charIdx];

      run[myIdx] = targetChar;
      targetRun[bestCand.charIdx] = ch;

      jobCounts[ch.jobCode] = (jobCounts[ch.jobCode] || 0) - 1;
      jobCounts[targetChar.jobCode] = (jobCounts[targetChar.jobCode] || 0) + 1;
    }
  }

  return runs;
}

/**
 * ✅ [추가] 세르카 런 구성 최종 강제 보정
 * - 어떤 이유로든(스왑/제외/후처리) "서폿0 + 4명"이 생기면 안 됨
 * - 서폿 없는 런은 최대 3명으로 맞추고, 남는 1명(DPS)을
 *   '서폿이 있는 런 중 빈자리가 있는 곳'으로 이동시킨다.
 */
function enforceSerkaRunsNoSupportCap(runsMembers: Character[][]): Character[][] {
  const maxPerRun = 4;
  const noSupCap = 3;

  const runs = runsMembers.map((r) => [...r]);

  const runHasUser = (run: Character[], discordName: string) =>
    run.some((m) => m.discordName === discordName);

  const supCount = (run: Character[]) => run.filter((m) => m.role === 'SUPPORT').length;

  let changed = true;
  let guard = 0;

  while (changed && guard < 200) {
    guard++;
    changed = false;

    // 1) 서폿 없는 런이 4명이면 -> 1명 빼야함
    for (let srcIdx = 0; srcIdx < runs.length; srcIdx++) {
      const src = runs[srcIdx];
      if (src.length <= noSupCap) continue;
      if (supCount(src) > 0) continue; // 서폿 있는 4인은 OK

      // 빼낼 후보(DPS) - 낮은 전투력부터 이동
      const dpsCandidates = [...src]
        .filter((m) => m.role === 'DPS')
        .sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id));

      if (dpsCandidates.length === 0) continue;

      const mover = dpsCandidates[0];

      // 2) 받을 런: 서폿이 있고, 4명 미만, 같은 유저 없고, (세르카) 같은 직업 DPS 중복 없게
      let bestTargetIdx = -1;
      let bestTargetSize = -1;

      for (let tIdx = 0; tIdx < runs.length; tIdx++) {
        if (tIdx === srcIdx) continue;
        const target = runs[tIdx];

        if (target.length >= maxPerRun) continue;
        if (supCount(target) <= 0) continue; // 서폿이 있는 런에 우선 넣기
        if (runHasUser(target, mover.discordName)) continue;

        // 세르카: 같은 직업 DPS 중복 금지
        const sameJobDps = target.filter(
          (m) => m.role === 'DPS' && m.jobCode === mover.jobCode,
        ).length;
        if (sameJobDps >= 1) continue;

        if (target.length > bestTargetSize) {
          bestTargetSize = target.length;
          bestTargetIdx = tIdx;
        }
      }

      if (bestTargetIdx === -1) {
        // 서폿 있는 런이 없거나 못 넣는 상황이면, 그냥 빈 런(3 이하) 중 규칙 맞는 곳으로 이동(최후)
        for (let tIdx = 0; tIdx < runs.length; tIdx++) {
          if (tIdx === srcIdx) continue;
          const target = runs[tIdx];
          if (target.length >= maxPerRun) continue;
          if (runHasUser(target, mover.discordName)) continue;

          // 서폿 없는 런이면 cap 3을 넘기면 안됨
          if (supCount(target) === 0 && target.length >= noSupCap) continue;

          const sameJobDps = target.filter(
            (m) => m.role === 'DPS' && m.jobCode === mover.jobCode,
          ).length;
          if (sameJobDps >= 1) continue;

          bestTargetIdx = tIdx;
          break;
        }
      }

      if (bestTargetIdx === -1) continue;

      // 이동
      const srcRemoveIdx = src.findIndex((m) => m.id === mover.id);
      if (srcRemoveIdx === -1) continue;

      src.splice(srcRemoveIdx, 1);
      runs[bestTargetIdx].push(mover);

      changed = true;
      break; // 다시 스캔
    }
  }

  return runs;
}

function groupCharactersByRaid(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
): RaidBucket[] {
  const map: Record<RaidId, Character[]> = {
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  characters.forEach((ch) => {
    const targetRaids = getTargetRaidsForCharacter(ch);
    targetRaids.forEach((raidId) => {
      const excludedList = exclusions[raidId];
      if (excludedList && excludedList.includes(ch.id)) return;
      if (map[raidId]) map[raidId].push(ch);
    });
  });

  return (Object.keys(map) as RaidId[]).map((raidId) => ({
    raidId,
    characters: map[raidId].sort(
      (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
    ),
  }));
}

function distributeCharactersIntoRuns(
  raidId: RaidId,
  characters: Character[],
  balanceMode: BalanceMode,
  random: () => number,
): RaidRun[] {
  if (characters.length === 0) return [];

  const cfg = getRaidConfig(raidId);
  const maxSupportsPerRun = cfg.maxSupportsPerRun;
  const maxPerRun = getEffectiveMaxPerRun(raidId, characters);
  const dim = getBalanceDimension(balanceMode);
  const speed = isSpeedMode(balanceMode);
  const lockIds = new Set<string>();

  const perPlayerCount: Record<string, number> = {};
  let supportCount = 0;
  characters.forEach((ch) => {
    perPlayerCount[ch.discordName] = (perPlayerCount[ch.discordName] || 0) + 1;
    if (ch.role === 'SUPPORT') supportCount++;
  });

  const reserveLastSlotForSupport = shouldReserveLastSlotForSupport(
    raidId,
    maxPerRun,
    maxSupportsPerRun,
    supportCount,
  );

  const maxCharsForOnePlayer = Object.values(perPlayerCount).reduce(
    (max, v) => (v > max ? v : max),
    0,
  );
  const baseRunsBySize = Math.ceil(characters.length / maxPerRun);
  const runsBySupport = Math.ceil(supportCount / maxSupportsPerRun);
  const runCount = Math.max(baseRunsBySize, maxCharsForOnePlayer || 1, runsBySupport);

  const runsMembers: Character[][] = Array.from({ length: runCount }, () => [] as Character[]);
  const runsTotalPower: number[] = Array(runCount).fill(0);
  const runsDpsPower: number[] = Array(runCount).fill(0);
  const runsSupPower: number[] = Array(runCount).fill(0);
  const runsPlayerCounts: Array<Record<string, number>> = Array.from({ length: runCount }, () => ({}));

  const isSerka = isSerkaRaid(raidId);
  const maxSameJobDps = getMaxSameJobDpsInRun(raidId);

  let sorted: Character[] = [...characters]
    .filter((c) => !lockIds.has(c.id))
    .sort((a, b) => {
      if (isSerka) {
        if (a.role !== b.role) return a.role === 'SUPPORT' ? -1 : 1;
        return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
      }

      if (speed) {
        if (a.role !== b.role) return a.role === 'DPS' ? -1 : 1;
        return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
      }

      if (a.role !== b.role) return a.role === 'SUPPORT' ? -1 : 1;
      return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
    });

  sorted.forEach((ch) => {
    let bestIndex = -1;
    const currentRunCount = runsMembers.length;

    if (speed || isSerka) {
      let bestSize = -1;

      for (let i = 0; i < currentRunCount; i++) {
        if (
          !canAddToRunGreedy(
            raidId,
            runsMembers[i],
            runsPlayerCounts[i],
            ch,
            maxPerRun,
            maxSupportsPerRun,
            reserveLastSlotForSupport,
          )
        )
          continue;

        const size = runsMembers[i].length;
        if (size > bestSize) {
          bestSize = size;
          bestIndex = i;
        }
      }
    } else {
      let bestScore: [number, number, number] | null = null;

      for (let i = 0; i < currentRunCount; i++) {
        if (
          !canAddToRunGreedy(
            raidId,
            runsMembers[i],
            runsPlayerCounts[i],
            ch,
            maxPerRun,
            maxSupportsPerRun,
            reserveLastSlotForSupport,
          )
        )
          continue;

        const size = runsMembers[i].length;
        const metric =
          dim === 'overall'
            ? runsTotalPower[i]
            : ch.role === 'DPS'
              ? runsDpsPower[i]
              : runsSupPower[i];

        const score: [number, number, number] = [metric, size, i];
        if (!bestScore || score[0] < bestScore[0]) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    // ✅ 2차 fallback
    if (bestIndex === -1) {
      let bestSize = -1;

      for (let i = 0; i < currentRunCount; i++) {
        const size = runsMembers[i].length;
        if (size >= maxPerRun) continue;
        if (runsPlayerCounts[i][ch.discordName]) continue;

        if (ch.role === 'SUPPORT') {
          const supCount = runsMembers[i].filter((m) => m.role === 'SUPPORT').length;
          if (supCount >= maxSupportsPerRun) continue;
        } else {
          if (reserveLastSlotForSupport) {
            const supCountNow = runsMembers[i].filter((m) => m.role === 'SUPPORT').length;
            const remainingSlots = maxPerRun - runsMembers[i].length;
            if (supCountNow === 0 && remainingSlots === 1) continue;
          }

          // ✅ [SERKA] 서폿 없는 런 cap 3
          {
            const supCountNow = runsMembers[i].filter((m) => m.role === 'SUPPORT').length;
            const maxNoSup = getMaxMembersWhenNoSupportInRun(raidId);
            if (supCountNow === 0 && runsMembers[i].length >= maxNoSup) continue;
          }

          const sameJob = runsMembers[i].filter(
            (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
          ).length;
          if (sameJob >= maxSameJobDps) continue;
        }

        if (size > bestSize) {
          bestSize = size;
          bestIndex = i;
        }
      }
    }

    // ✅ 강제 이동(victim move)
    if (bestIndex === -1) {
      for (let candRunIdx = 0; candRunIdx < currentRunCount; candRunIdx++) {
        const candRun = runsMembers[candRunIdx];
        if (runsPlayerCounts[candRunIdx][ch.discordName]) continue;

        const victimOk = candRun.some((victim) => {
          if (victim.id === ch.id) return false;

          for (let targetRunIdx = 0; targetRunIdx < currentRunCount; targetRunIdx++) {
            if (targetRunIdx === candRunIdx) continue;
            const targetRun = runsMembers[targetRunIdx];
            if (targetRun.length >= maxPerRun) continue;
            if (runsPlayerCounts[targetRunIdx][victim.discordName]) continue;

            if (victim.role === 'SUPPORT') {
              const supCnt = targetRun.filter((m) => m.role === 'SUPPORT').length;
              if (supCnt >= maxSupportsPerRun) continue;
            } else {
              if (reserveLastSlotForSupport) {
                const supCountNow = targetRun.filter((m) => m.role === 'SUPPORT').length;
                const remainingSlots = maxPerRun - targetRun.length;
                if (supCountNow === 0 && remainingSlots === 1) continue;
              }

              // ✅ [SERKA] 서폿 없는 런 cap 3
              {
                const supCountNow = targetRun.filter((m) => m.role === 'SUPPORT').length;
                const maxNoSup = getMaxMembersWhenNoSupportInRun(raidId);
                if (supCountNow === 0 && targetRun.length >= maxNoSup) continue;
              }

              const sameJob = targetRun.filter(
                (m) => m.role === 'DPS' && m.jobCode === victim.jobCode,
              ).length;
              if (sameJob >= maxSameJobDps) continue;
            }

            const removeIdx = candRun.findIndex((v) => v.id === victim.id);
            if (removeIdx === -1) return false;

            candRun.splice(removeIdx, 1);
            runsPlayerCounts[candRunIdx][victim.discordName]--;
            runsTotalPower[candRunIdx] -= victim.combatPower;

            targetRun.push(victim);
            runsPlayerCounts[targetRunIdx][victim.discordName] =
              (runsPlayerCounts[targetRunIdx][victim.discordName] || 0) + 1;
            runsTotalPower[targetRunIdx] += victim.combatPower;

            return true;
          }
          return false;
        });

        if (victimOk) {
          bestIndex = candRunIdx;
          break;
        }
      }
    }

    if (bestIndex === -1) {
      bestIndex = runsMembers.length;
      runsMembers.push([] as Character[]);
      runsTotalPower.push(0);
      runsDpsPower.push(0);
      runsSupPower.push(0);
      runsPlayerCounts.push({});
    }

    runsMembers[bestIndex].push(ch);
    runsTotalPower[bestIndex] += ch.combatPower;
    if (ch.role === 'DPS') runsDpsPower[bestIndex] += ch.combatPower;
    else runsSupPower[bestIndex] += ch.combatPower;
    runsPlayerCounts[bestIndex][ch.discordName] =
      (runsPlayerCounts[bestIndex][ch.discordName] || 0) + 1;
  });

  let optimizedRunsMembers: Character[][];

  if (speed) {
    optimizedRunsMembers = optimizeCombatPowerBySwapOnly(
      raidId,
      runsMembers,
      maxSupportsPerRun,
      dim,
      random,
      lockIds,
    );

    optimizedRunsMembers = compactRunsFrontloadedForSpeed(
      raidId,
      optimizedRunsMembers,
      maxPerRun,
      maxSupportsPerRun,
      reserveLastSlotForSupport,
    );
  } else {
    optimizedRunsMembers = optimizeRunsByStdDev(
      raidId,
      runsMembers,
      maxPerRun,
      maxSupportsPerRun,
      dim,
      random,
      lockIds,
      reserveLastSlotForSupport,
    );
  }

  let afterJobAdjust = minimizeSameJobInRuns(
    raidId,
    optimizedRunsMembers,
    maxPerRun,
    maxSupportsPerRun,
    reserveLastSlotForSupport,
  );
  afterJobAdjust = swapSameUserCharactersToFixDuplicates(raidId, afterJobAdjust);

  optimizedRunsMembers = adjustSoloLastRunStrongCharacter(
    raidId,
    afterJobAdjust,
    maxPerRun,
    maxSupportsPerRun,
    lockIds,
    reserveLastSlotForSupport,
  );

  // ✅ [추가] 세르카면 최종적으로 "서폿0 런 4명"을 강제로 해소
  if (isSerkaRaid(raidId)) {
    optimizedRunsMembers = enforceSerkaRunsNoSupportCap(optimizedRunsMembers);
  }

  const runs: RaidRun[] = [];
  optimizedRunsMembers.forEach((members, idx) => {
    if (members.length === 0) return;

    const parties = splitIntoPartiesLossless(members, raidId);
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

  return rebalanceSupportsGlobal(runs);
}

// ✅ 캐릭터 누락 방지 + 전투력 밸런싱(Snake) 파티 나누기 함수
function splitIntoPartiesLossless(members: Character[], raidId: RaidId): RaidRunParty[] {
  const cfg = getRaidConfig(raidId);
  const maxParties = cfg.maxParties;
  const maxPartySize = 4;
  const maxSupPerParty = 1;

  const supports = [...members]
    .filter((m) => m.role === 'SUPPORT')
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  const dps = [...members]
    .filter((m) => m.role === 'DPS')
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  const parties: FixedRaidRunParty[] = Array.from({ length: maxParties }, (_, idx) => ({
    partyIndex: idx + 1,
    members: [],
  }));

  const usedIds = new Set<string>();

  const addMember = (party: FixedRaidRunParty, c: Character) => {
    if (party.members.length >= maxPartySize) return false;
    party.members.push(c);
    usedIds.add(c.id);
    return true;
  };

  // 1) 서폿 우선 배치
  parties.forEach((p) => {
    const sup = supports.find((s) => !usedIds.has(s.id));
    if (sup && p.members.filter((m) => m.role === 'SUPPORT').length < maxSupPerParty)
      addMember(p, sup);
  });

  // 2) DPS 배치 (Snake)
  let placed = true;
  while (placed) {
    placed = false;

    for (let i = 0; i < maxParties; i++) {
      const p = parties[i];
      if (p.members.length >= maxPartySize) continue;

      const distinctDps = dps.find(
        (d) =>
          !usedIds.has(d.id) &&
          !p.members.some((m) => m.role === 'DPS' && m.jobCode === d.jobCode),
      );

      if (distinctDps) {
        addMember(p, distinctDps);
        placed = true;
      }
    }
    if (!placed) break;

    placed = false;
    for (let i = maxParties - 1; i >= 0; i--) {
      const p = parties[i];
      if (p.members.length >= maxPartySize) continue;

      const distinctDps = dps.find(
        (d) =>
          !usedIds.has(d.id) &&
          !p.members.some((m) => m.role === 'DPS' && m.jobCode === d.jobCode),
      );

      if (distinctDps) {
        addMember(p, distinctDps);
        placed = true;
      }
    }
  }

  // 3) 남은 인원 강제 배치
  [...supports, ...dps].forEach((c) => {
    if (!usedIds.has(c.id)) {
      for (const p of parties) {
        if (addMember(p, c)) break;
      }
    }
  });

  return parties.filter((p) => p.members.length > 0) as unknown as RaidRunParty[];
}

function rebalanceSupportsGlobal(runs: RaidRun[]): RaidRun[] {
  const result = runs.map((run) => ({
    ...run,
    parties: run.parties.map((p) => ({
      ...(p as unknown as FixedRaidRunParty),
      members: [...((p as unknown as FixedRaidRunParty).members)],
    })) as unknown as RaidRunParty[],
  }));

  const getRunAverageCombatPower = (runIndex: number): number => {
    const members = (result[runIndex].parties as unknown as FixedRaidRunParty[]).flatMap((p) => p.members);
    if (!members.length) return 0;
    const total = members.reduce((sum, m) => sum + m.combatPower, 0);
    return total / members.length;
  };

  const runHasUser = (runIndex: number, discordName: string): boolean => {
    return (result[runIndex].parties as unknown as FixedRaidRunParty[]).some((p) =>
      p.members.some((m) => m.discordName === discordName),
    );
  };

  const allParties: Array<{ runIndex: number; partyIndex: number; party: FixedRaidRunParty }> = [];

  result.forEach((run, ri) => {
    (run.parties as unknown as FixedRaidRunParty[]).forEach((p, pi) => {
      allParties.push({ runIndex: ri, partyIndex: pi, party: p });
    });
  });

  const lacking: typeof allParties = [];
  const donors: typeof allParties = [];

  for (const entry of allParties) {
    const supports = entry.party.members.filter((m) => m.role === 'SUPPORT').length;
    const size = entry.party.members.length;

    if (supports === 0 && size > 0) lacking.push(entry);
    if (supports === 1 && size === 1) donors.push(entry);
  }

  while (lacking.length > 0 && donors.length > 0) {
    const target = lacking.shift()!;
    const runAvgs = result.map((_, idx) => getRunAverageCombatPower(idx));
    const nonZeroAvgs = runAvgs.filter((v) => v > 0);
    const globalMedian = nonZeroAvgs.length > 0 ? median(nonZeroAvgs) : 0;
    const targetRunAvg = runAvgs[target.runIndex];

    let bestDonorIdx = -1;

    if (targetRunAvg <= globalMedian) {
      let bestAvg = -Infinity;
      donors.forEach((donor, idx) => {
        const sup = donor.party.members.find((m) => m.role === 'SUPPORT');
        if (!sup) return;
        if (runHasUser(target.runIndex, sup.discordName)) return;
        const donorAvg = runAvgs[donor.runIndex];
        if (donorAvg > bestAvg) {
          bestAvg = donorAvg;
          bestDonorIdx = idx;
        }
      });
    } else {
      let bestAvg = Infinity;
      donors.forEach((donor, idx) => {
        const sup = donor.party.members.find((m) => m.role === 'SUPPORT');
        if (!sup) return;
        if (runHasUser(target.runIndex, sup.discordName)) return;
        const donorAvg = runAvgs[donor.runIndex];
        if (donorAvg < bestAvg) {
          bestAvg = donorAvg;
          bestDonorIdx = idx;
        }
      });
    }

    if (bestDonorIdx === -1) continue;

    const donor = donors.splice(bestDonorIdx, 1)[0];
    const supIndex = donor.party.members.findIndex((m) => m.role === 'SUPPORT');
    if (supIndex === -1) continue;

    const sup = donor.party.members.splice(supIndex, 1)[0];
    target.party.members.push(sup);
  }

  return result;
}

// ==============================
// ✅ 불변성 유지용: schedule deep-ish clone
// (Character 객체 자체는 재사용, 배열/런/파티는 새로 생성)
// ==============================
function cloneSchedule(schedule: RaidSchedule): RaidSchedule {
  const result: RaidSchedule = {
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  (Object.keys(result) as RaidId[]).forEach((raidId) => {
    const runs = schedule[raidId] ?? [];
    result[raidId] = runs.map((run) => ({
      ...run,
      parties: run.parties.map((p) => ({
        ...p,
        members: [...p.members],
      })),
    }));
  });

  return result;
}

function enforceExclusions(schedule: RaidSchedule, exclusions: RaidExclusionMap): RaidSchedule {
  const next = cloneSchedule(schedule);

  (Object.keys(next) as RaidId[]).forEach((raidId) => {
    const excluded = new Set(exclusions?.[raidId] ?? []);
    next[raidId] = (next[raidId] ?? [])
      .map((run) => ({
        ...run,
        parties: run.parties
          .map((p) => ({ ...p, members: p.members.filter((m) => !excluded.has(m.id)) }))
          .filter((p) => p.members.length > 0),
      }))
      .filter((run) => run.parties.length > 0);
  });

  return next;
}

// ✅ 교체(Swap) 적용 함수 (immutable)
function applySwaps(schedule: RaidSchedule, swaps: RaidSwap[], allCharacters: Character[]): RaidSchedule {
  const next = cloneSchedule(schedule);
  const raidIds = Object.keys(next) as RaidId[];

  raidIds.forEach((raidId) => {
    const raidSwaps = swaps.filter((s) => s.raidId === raidId);
    if (raidSwaps.length === 0) return;

    const runs = next[raidId];
    if (!runs) return;

    const findMemberLocation = (targetId: string) => {
      for (const run of runs) {
        for (const party of run.parties) {
          const idx = party.members.findIndex((m) => m.id === targetId);
          if (idx !== -1) return { list: party.members, idx };
        }
      }
      return null;
    };

    raidSwaps.forEach(({ charId1, charId2 }) => {
      const loc1 = findMemberLocation(charId1);
      const loc2 = findMemberLocation(charId2);

      if (loc1 && loc2) {
        const temp = loc1.list[loc1.idx];
        loc1.list[loc1.idx] = loc2.list[loc2.idx];
        loc2.list[loc2.idx] = temp;
      } else if (loc1 && !loc2) {
        const char2 = allCharacters.find((c) => c.id === charId2);
        if (char2) loc1.list[loc1.idx] = char2;
      } else if (!loc1 && loc2) {
        const char1 = allCharacters.find((c) => c.id === charId1);
        if (char1) loc2.list[loc2.idx] = char1;
      }
    });
  });

  return next;
}

/**
 * ✅ [추가] 최종 스케줄에서 세르카 구성 강제
 * - applySwaps/enforceExclusions 이후에도 4딜 런이 생길 수 있으니 마지막에 한번 더 보정
 */
function enforceSerkaDpsCapOnSchedule(schedule: RaidSchedule): RaidSchedule {
  const next = cloneSchedule(schedule);

  const raidIds: RaidId[] = ['SERKA_NORMAL', 'SERKA_HARD', 'SERKA_NIGHTMARE'];

  const recomputeAvg = (run: RaidRun): RaidRun => {
    const members = (run.parties as unknown as FixedRaidRunParty[]).flatMap((p) => p.members);
    if (!members.length) return { ...run, averageCombatPower: 0 };
    const avg = members.reduce((s, m) => s + m.combatPower, 0) / members.length;
    return { ...run, averageCombatPower: Math.round(avg) };
  };

  for (const raidId of raidIds) {
    const runs = next[raidId] ?? [];
    if (runs.length <= 1) continue;

    // 세르카는 파티 1개 전제
    const getRunMembers = (ri: number): Character[] =>
      ((runs[ri].parties[0] as unknown) as FixedRaidRunParty).members;

    const supCount = (members: Character[]) => members.filter((m) => m.role === 'SUPPORT').length;
    const hasUser = (members: Character[], discordName: string) =>
      members.some((m) => m.discordName === discordName);

    let changed = true;
    let guard = 0;

    while (changed && guard < 200) {
      guard++;
      changed = false;

      // src: 서폿0 + 4명 런
      const srcIdx = runs.findIndex((run) => {
        const mem = getRunMembers(runs.indexOf(run));
        return mem.length === 4 && supCount(mem) === 0;
      });
      if (srcIdx === -1) break;

      const srcMembers = getRunMembers(srcIdx);

      // 옮길 DPS: 전투력 낮은 순
      const mover = [...srcMembers]
        .filter((m) => m.role === 'DPS')
        .sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id))[0];

      if (!mover) break;

      // dst: 서폿이 있고 3/4인 런(빈자리), 유저 중복 X, 세르카 동일직업DPS 중복 X
      let bestDstIdx = -1;
      let bestSize = -1;

      for (let di = 0; di < runs.length; di++) {
        if (di === srcIdx) continue;

        const dstMembers = getRunMembers(di);
        if (dstMembers.length >= 4) continue;
        if (supCount(dstMembers) <= 0) continue;
        if (hasUser(dstMembers, mover.discordName)) continue;

        const sameJobDps = dstMembers.filter(
          (m) => m.role === 'DPS' && m.jobCode === mover.jobCode,
        ).length;
        if (sameJobDps >= 1) continue;

        if (dstMembers.length > bestSize) {
          bestSize = dstMembers.length;
          bestDstIdx = di;
        }
      }

      if (bestDstIdx === -1) break;

      // 이동 실행
      const removeIdx = srcMembers.findIndex((m) => m.id === mover.id);
      if (removeIdx === -1) break;

      srcMembers.splice(removeIdx, 1);
      getRunMembers(bestDstIdx).push(mover);

      // 평균 재계산
      runs[srcIdx] = recomputeAvg(runs[srcIdx]);
      runs[bestDstIdx] = recomputeAvg(runs[bestDstIdx]);

      changed = true;
    }

    next[raidId] = runs;
  }

  return next;
}

export function buildRaidSchedule(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  balanceMode: BalanceMode = 'speed',
  raidSettings: RaidSettingsMap = {},
  swaps: RaidSwap[] = [],
): RaidSchedule {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered, exclusions);

  const SEED = 123456789;
  const seededRng = createSeededRandom(SEED);

  const schedule: RaidSchedule = {
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  buckets.forEach(({ raidId, characters }) => {
    const supportShortage = Boolean(raidSettings?.[raidId]);
    const pool = supportShortage
      ? promoteValkyToSupportIfNeeded(raidId, characters)
      : characters;

    if (schedule[raidId] !== undefined) {
      schedule[raidId] = distributeCharactersIntoRuns(raidId, pool, balanceMode, seededRng);
    }
  });

  // ✅ immutable pipeline
  const scheduleWithSwaps = applySwaps(schedule, swaps, characters);
  const scheduleWithExclusions = enforceExclusions(scheduleWithSwaps, exclusions);

  // ✅ [추가] 최종적으로 세르카는 "서폿0 4명"이 절대 안 나오도록 강제 보정
  return enforceSerkaDpsCapOnSchedule(scheduleWithExclusions);
}

// ==============================
// ✅ 레이드별 후보풀(대상자) 생성
// ==============================
export function buildRaidCandidatesMap(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  raidSettings: RaidSettingsMap = {},
): Record<RaidId, Character[]> {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);

  const map: Record<RaidId, Character[]> = {
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  filtered.forEach((ch) => {
    const targetRaids = getTargetRaidsForCharacter(ch);
    targetRaids.forEach((raidId) => {
      if (map[raidId]) map[raidId].push(ch);
    });
  });

  (Object.keys(map) as RaidId[]).forEach((raidId) => {
    const list = map[raidId];
    if (list.length === 0) return;

    const byId = new Map<string, Character>();
    list.forEach((c) => {
      if (!byId.has(c.id)) byId.set(c.id, c);
    });

    const unique = Array.from(byId.values()).sort(
      (a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id),
    );

    const supportShortage = Boolean(raidSettings?.[raidId]);
    if (supportShortage) {
      const excludedIds = new Set(exclusions?.[raidId] ?? []);
      const remaining = unique.filter((c) => !excludedIds.has(c.id));
      const promotedRemaining = promoteValkyToSupportIfNeeded(raidId, remaining);

      const promotedById = new Map(promotedRemaining.map((c) => [c.id, c]));
      map[raidId] = unique.map((c) => promotedById.get(c.id) ?? c);
    } else {
      map[raidId] = unique;
    }
  });

  return map;
}
