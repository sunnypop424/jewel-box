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
// 🔧 타입 보정
// ==============================
type FixedRaidRunParty = Omit<RaidRunParty, 'members'> & { members: Character[] };

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

function isFourPlayerRaid(raidId: RaidId): boolean {
  return raidId.startsWith('SERKA_') || raidId.startsWith('HORIZON_');
}

type RaidConfig = {
  maxPerRun: number;
  maxSupportsPerRun: number;
  maxParties: number;
};

function getRaidConfig(raidId: RaidId, fillTwoSupports: boolean): RaidConfig {
  if (isFourPlayerRaid(raidId)) return { maxPerRun: 4, maxSupportsPerRun: 1, maxParties: 1 };
  return { maxPerRun: 8, maxSupportsPerRun: fillTwoSupports ? 2 : 1, maxParties: 2 };
}

function getRunSizeCapBySupports(raidId: RaidId, supportCount: number): number {
  if (isFourPlayerRaid(raidId)) return supportCount > 0 ? 4 : 3;
  if (supportCount <= 0) return 6;
  if (supportCount === 1) return 7;
  return 8;
}

function getEffectiveMaxPerRun(raidId: RaidId, characters: Character[], fillTwoSupports: boolean): number {
  const cfg = getRaidConfig(raidId, fillTwoSupports);
  const uniqueUsers = new Set(characters.map((c) => c.discordName)).size;
  return Math.max(1, Math.min(cfg.maxPerRun, uniqueUsers));
}

function estimateRunCount(raidId: RaidId, characters: Character[], fillTwoSupports: boolean): number {
  if (characters.length === 0) return 0;
  const cfg = getRaidConfig(raidId, fillTwoSupports);
  const maxPerRun = cfg.maxPerRun;
  const perPlayerCount: Record<string, number> = {};
  let supportCount = 0;

  characters.forEach((ch) => {
    perPlayerCount[ch.discordName] = (perPlayerCount[ch.discordName] || 0) + 1;
    if (ch.role === 'SUPPORT') supportCount++;
  });

  const maxCharsForOnePlayer = Object.values(perPlayerCount).reduce((max, v) => (v > max ? v : max), 0);
  const baseRunsBySize = Math.ceil(characters.length / maxPerRun);

  let runsBySupport = 1;
  if (isFourPlayerRaid(raidId)) {
    runsBySupport = Math.max(1, supportCount || 1);
  } else if (fillTwoSupports) {
    runsBySupport = Math.max(1, Math.ceil(supportCount / 2));
  } else {
    runsBySupport = 1;
  }

  return Math.max(baseRunsBySize, maxCharsForOnePlayer || 1, runsBySupport);
}

function getTargetRaidsForCharacter(ch: Character): RaidId[] {
  const il = ch.itemLevel;
  const raids: RaidId[] = [];

  if (il >= 1750) raids.push('HORIZON_STEP3');
  else if (il >= 1720) raids.push('HORIZON_STEP2');
  else if (il >= 1700) raids.push('HORIZON_STEP1');

  if (il >= 1740 && ch.serkaNightmare === true) raids.push('SERKA_NIGHTMARE');
  else if (il >= 1730) raids.push('SERKA_HARD');
  else if (il >= 1710) raids.push('SERKA_NORMAL');

  if (il >= 1730) raids.push('FINAL_HARD');
  else if (il >= 1710) raids.push('FINAL_NORMAL');

  if (il >= 1720) raids.push('ACT4_HARD');
  else if (il >= 1700) raids.push('ACT4_NORMAL');

  if (il < 1710) {
    if (il >= 1700) raids.push('ACT3_HARD');
    else if (il >= 1680) raids.push('ACT3_NORMAL');
    if (il >= 1690) raids.push('ACT2_HARD');
    else if (il >= 1670) raids.push('ACT2_NORMAL');
    if (il >= 1680) raids.push('ACT1_HARD');
  }

  const horizonRaids = raids.filter((r) => r.startsWith('HORIZON_'));
  const normalRaids = raids.filter((r) => !r.startsWith('HORIZON_'));
  return [...horizonRaids, ...normalRaids.slice(0, 3)];
}

interface RaidBucket {
  raidId: RaidId;
  characters: Character[];
}

type FixedPresetMatcher = {
  discordName: string;
  jobCode: string;
};

type FixedPresetSlot = {
  candidates: FixedPresetMatcher[];
};

type ResolvedFixedPresetRuns = {
  presetRuns: Character[][];
  remainingChars: Character[];
  matchedIds: Set<string>;
  assignmentMap: Map<string, number>;
};

const fixedSlot = (...candidates: FixedPresetMatcher[]): FixedPresetSlot => ({
  candidates,
});

const FIXED_RAID_RUN_PRESETS: Partial<Record<RaidId, FixedPresetSlot[][]>> = {
  HORIZON_STEP3: [
    [
      fixedSlot({ discordName: '흑마66', jobCode: '워로드' }),
      fixedSlot({ discordName: '딘또썬', jobCode: '기상술사' }),
      fixedSlot({ discordName: '말랭짱', jobCode: '블레이드' }),
      fixedSlot({ discordName: '고추좋아해요', jobCode: '홀리나이트' }),
    ],
    [
      fixedSlot(
        { discordName: '지혜쨩', jobCode: '배틀마스터' },
        { discordName: '지혜쨩', jobCode: '발키리' },
      ),
      fixedSlot({ discordName: 'Sora', jobCode: '브레이커' }),
      fixedSlot({ discordName: '말랭짱', jobCode: '슬레이어' }),
      fixedSlot({ discordName: '딘또썬', jobCode: '도화가' }),
    ],
  ],
  SERKA_NIGHTMARE: [
    [
      fixedSlot({ discordName: '흑마66', jobCode: '워로드' }),
      fixedSlot({ discordName: '딘또썬', jobCode: '기상술사' }),
      fixedSlot({ discordName: '말랭짱', jobCode: '블레이드' }),
      fixedSlot({ discordName: '고추좋아해요', jobCode: '홀리나이트' }),
    ],
    [
      fixedSlot(
        { discordName: '지혜쨩', jobCode: '배틀마스터' },
        { discordName: '지혜쨩', jobCode: '발키리' },
      ),
      fixedSlot({ discordName: 'Sora', jobCode: '브레이커' }),
      fixedSlot({ discordName: '말랭짱', jobCode: '슬레이어' }),
      fixedSlot({ discordName: '딘또썬', jobCode: '도화가' }),
    ],
  ],
};

function matchesFixedPreset(ch: Character, matcher: FixedPresetMatcher): boolean {
  return ch.discordName === matcher.discordName && ch.jobCode === matcher.jobCode;
}

function getFixedPresetCandidates(
  pool: Character[],
  slot: FixedPresetSlot,
  usedIds: Set<string>,
): Character[] {
  return pool
    .filter(
      (ch) =>
        !usedIds.has(ch.id) &&
        slot.candidates.some((matcher) => matchesFixedPreset(ch, matcher)),
    )
    .sort((a, b) => {
      if (a.combatPower !== b.combatPower) return b.combatPower - a.combatPower;
      if (a.itemLevel !== b.itemLevel) return b.itemLevel - a.itemLevel;
      return a.id.localeCompare(b.id);
    });
}

function resolveFixedPresetRunsForRaid(
  raidId: RaidId,
  characters: Character[],
): ResolvedFixedPresetRuns {
  const presets = FIXED_RAID_RUN_PRESETS[raidId] ?? [];

  if (presets.length === 0) {
    return {
      presetRuns: [],
      remainingChars: [...characters],
      matchedIds: new Set<string>(),
      assignmentMap: new Map<string, number>(),
    };
  }

  let remainingChars = [...characters];
  const presetRuns: Character[][] = [];
  const matchedIds = new Set<string>();
  const assignmentMap = new Map<string, number>();

  for (const presetRun of presets) {
    const localUsedIds = new Set<string>();
    const picked: Character[] = [];
    let failed = false;

    for (const slot of presetRun) {
      const candidates = getFixedPresetCandidates(remainingChars, slot, localUsedIds);
      const chosen = candidates[0];

      if (!chosen) {
        failed = true;
        break;
      }

      picked.push(chosen);
      localUsedIds.add(chosen.id);
    }

    if (failed) continue;

    remainingChars = remainingChars.filter((ch) => !localUsedIds.has(ch.id));

    const resolvedRunIndex = presetRuns.length + 1;
    picked.forEach((ch) => {
      matchedIds.add(ch.id);
      assignmentMap.set(ch.id, resolvedRunIndex);
    });

    presetRuns.push(picked);
  }

  return {
    presetRuns,
    remainingChars,
    matchedIds,
    assignmentMap,
  };
}

export function getFixedPresetAssignmentMap(
  raidId: RaidId,
  characters: Character[],
): Record<string, number> {
  const resolved = resolveFixedPresetRunsForRaid(
    raidId,
    characters.filter((c) => !c.isGuest),
  );

  const result: Record<string, number> = {};
  resolved.assignmentMap.forEach((runIndex, charId) => {
    result[charId] = runIndex;
  });
  return result;
}

function createRaidRunFromMembers(
  raidId: RaidId,
  members: Character[],
  runIndex: number,
): RaidRun {
  const parties = splitIntoPartiesLossless(members, raidId);
  const averageCombatPower =
    members.length > 0
      ? Math.round(
          members.reduce((sum, c) => sum + c.combatPower, 0) / members.length,
        )
      : 0;

  return {
    raidId,
    runIndex,
    parties,
    averageCombatPower,
  };
}

function buildRunsWithFixedPresets(
  raidId: RaidId,
  characters: Character[],
  balanceMode: BalanceMode,
  random: () => number,
  fillTwoSupports: boolean,
): RaidRun[] {
  const resolved = resolveFixedPresetRunsForRaid(raidId, characters);

  if (resolved.presetRuns.length === 0) {
    return distributeCharactersIntoRuns(
      raidId,
      characters,
      balanceMode,
      random,
      fillTwoSupports,
    );
  }

  const fixedRuns = resolved.presetRuns.map((members, idx) =>
    createRaidRunFromMembers(raidId, members, idx + 1),
  );

  const flexibleRuns = distributeCharactersIntoRuns(
    raidId,
    resolved.remainingChars,
    balanceMode,
    random,
    fillTwoSupports,
  ).map((run, idx) => ({
    ...run,
    runIndex: fixedRuns.length + idx + 1,
  }));

  return [...fixedRuns, ...flexibleRuns];
}

function std(values: number[]): number {
  const arr = values.filter((v) => Number.isFinite(v));
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / arr.length;
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
      if (m.role === 'DPS') { dpsSum += m.combatPower; dpsCnt++; }
      else { supSum += m.combatPower; supCnt++; }
    });
    dpsAvgs.push(dpsCnt > 0 ? dpsSum / dpsCnt : 0);
    supAvgs.push(supCnt > 0 ? supSum / supCnt : 0);
  });

  return std(dpsAvgs) + std(supAvgs);
}

function getMaxSameJobDpsInRun(raidId: RaidId): number {
  return isFourPlayerRaid(raidId) ? 1 : 2;
}

function isRunValid(raidId: RaidId, members: Character[], maxPerRun: number, maxSupportsPerRun: number): boolean {
  if (members.length === 0) return true;

  const supports = members.filter((m) => m.role === 'SUPPORT').length;
  if (supports > maxSupportsPerRun) return false;

  const cap = Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supports));
  if (members.length > cap) return false;

  const names = new Set<string>();
  for (const m of members) {
    if (names.has(m.discordName)) return false;
    names.add(m.discordName);
  }

  const maxSame = getMaxSameJobDpsInRun(raidId);
  const jobCount: Record<string, number> = {};
  for (const m of members) {
    if (m.role !== 'DPS') continue;
    jobCount[m.jobCode] = (jobCount[m.jobCode] || 0) + 1;
    if (jobCount[m.jobCode] > maxSame) return false;
  }

  return true;
}

function promoteValkyToSupportIfNeeded(raidId: RaidId, characters: Character[], fillTwoSupports: boolean): Character[] {
  const cfg = getRaidConfig(raidId, fillTwoSupports);
  const candidates = characters
    .filter((c) => c.jobCode === '발키리' && c.role === 'DPS' && c.valkyCanSupport === true)
    .slice().sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id));

  if (candidates.length === 0) return characters;

  const runCount = estimateRunCount(raidId, characters, fillTwoSupports);
  const requiredSupports = runCount * cfg.maxSupportsPerRun;
  const existingSupports = characters.filter((c) => c.role === 'SUPPORT').length;

  const need = requiredSupports - existingSupports;
  if (need <= 0) return characters;

  const promote = candidates.slice(0, need);
  const promoteIds = new Set(promote.map((c) => c.id));

  return characters.map((c) => (promoteIds.has(c.id) ? { ...c, role: 'SUPPORT' } : c));
}

// ==========================================
// 🌟 Wave(동시 출발 그룹) 겹침 방지 함수
// ==========================================
function canAddToRunGreedy(
  raidId: RaidId,
  runsMembers: Character[][],
  targetRunIdx: number,
  runPlayerCounts: Record<string, number>,
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
  concurrentRuns: number,
): boolean {
  const runMembers = runsMembers[targetRunIdx];
  if (runMembers.length >= maxPerRun) return false;
  if (runPlayerCounts[ch.discordName]) return false;

  if (concurrentRuns > 1) {
    const targetWave = Math.floor(targetRunIdx / concurrentRuns);
    const waveStart = targetWave * concurrentRuns;
    const waveEnd = waveStart + concurrentRuns;
    for (let i = waveStart; i < waveEnd && i < runsMembers.length; i++) {
      if (i === targetRunIdx) continue;
      if (runsMembers[i].some((m) => m.discordName === ch.discordName)) return false;
    }
  }

  const supNow = runMembers.filter((m) => m.role === 'SUPPORT').length;
  const supAfter = supNow + (ch.role === 'SUPPORT' ? 1 : 0);
  if (supAfter > maxSupportsPerRun) return false;

  const cap = Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supAfter));
  if (runMembers.length + 1 > cap) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter((m) => m.role === 'DPS' && m.jobCode === ch.jobCode).length;
    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);
    if (sameJob >= maxSameJobDps) return false;
  }

  return true;
}

function canAddToRunLocalSearch(
  raidId: RaidId,
  runsMembers: Character[][],
  targetRunIdx: number,
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
  concurrentRuns: number,
): boolean {
  const runMembers = runsMembers[targetRunIdx];
  if (runMembers.length >= maxPerRun) return false;
  if (runMembers.some((m) => m.discordName === ch.discordName)) return false;

  if (concurrentRuns > 1) {
    const targetWave = Math.floor(targetRunIdx / concurrentRuns);
    const waveStart = targetWave * concurrentRuns;
    const waveEnd = waveStart + concurrentRuns;
    for (let i = waveStart; i < waveEnd && i < runsMembers.length; i++) {
      if (i === targetRunIdx) continue;
      if (runsMembers[i].some((m) => m.discordName === ch.discordName)) return false;
    }
  }

  const supNow = runMembers.filter((m) => m.role === 'SUPPORT').length;
  const supAfter = supNow + (ch.role === 'SUPPORT' ? 1 : 0);
  if (supAfter > maxSupportsPerRun) return false;

  const cap = Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supAfter));
  if (runMembers.length + 1 > cap) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter((m) => m.role === 'DPS' && m.jobCode === ch.jobCode).length;
    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);
    if (sameJob >= maxSameJobDps) return false;
  }

  return true;
}

function packSupportsToTwoPerRunIfPossible(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  fillTwoSupports: boolean,
  concurrentRuns: number,
): Character[][] {
  if (!fillTwoSupports) return runsMembers;
  if (isFourPlayerRaid(raidId)) return runsMembers;

  const runs = runsMembers.map((r) => [...r]);
  const supCount = (run: Character[]) => run.filter((m) => m.role === 'SUPPORT').length;
  const hasUser = (run: Character[], discordName: string) => run.some((m) => m.discordName === discordName);

  let changed = true;
  let guard = 0;

  while (changed && guard < 200) {
    guard++;
    changed = false;

    const oneSupRuns = runs.map((r, idx) => ({ idx, r, s: supCount(r) })).filter((x) => x.s === 1 && x.r.length > 0);
    if (oneSupRuns.length < 2) break;

    oneSupRuns.sort((a, b) => b.r.length - a.r.length);
    const receiverIdx = oneSupRuns[0].idx;

    let donorIdx = -1;

    for (let k = oneSupRuns.length - 1; k >= 1; k--) {
      const cand = oneSupRuns[k];
      const donor = cand.r;

      const sup = donor.find((m) => m.role === 'SUPPORT');
      if (!sup) continue;
      if (hasUser(runs[receiverIdx], sup.discordName)) continue;

      if (concurrentRuns > 1) {
        let conflict = false;
        const targetWave = Math.floor(receiverIdx / concurrentRuns);
        const waveStart = targetWave * concurrentRuns;
        const waveEnd = waveStart + concurrentRuns;
        for (let i = waveStart; i < waveEnd && i < runs.length; i++) {
          if (i === receiverIdx) continue;
          if (runs[i].some((m) => m.discordName === sup.discordName)) {
            conflict = true; break;
          }
        }
        if (conflict) continue;
      }

      const donorAfter = donor.filter((m) => m.id !== sup.id);
      const receiverAfter = [...runs[receiverIdx], sup];

      if (!isRunValid(raidId, donorAfter, maxPerRun, maxSupportsPerRun)) continue;
      if (!isRunValid(raidId, receiverAfter, maxPerRun, maxSupportsPerRun)) continue;

      donorIdx = cand.idx;
      break;
    }

    if (donorIdx === -1) break;

    const donor = runs[donorIdx];
    const supIndex = donor.findIndex((m) => m.role === 'SUPPORT');
    if (supIndex === -1) break;

    const sup = donor.splice(supIndex, 1)[0];
    runs[receiverIdx].push(sup);
    changed = true;
  }
  return runs;
}

// ✅ lockIds 추가 적용
function maximizeRunsFrontloaded(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  fillTwoSupports: boolean,
  concurrentRuns: number,
  lockIds: Set<string> = new Set(), // 🔒 추가됨
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);

  const supCount = (run: Character[]) => run.filter((m) => m.role === 'SUPPORT').length;
  const buildPlayerSet = (run: Character[]) => new Set(run.map((m) => m.discordName));
  const runCap = (run: Character[]) => Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supCount(run)));
  const donorValidAfterRemoval = (donor: Character[], removeId: string) => isRunValid(raidId, donor.filter((m) => m.id !== removeId), maxPerRun, maxSupportsPerRun);

  if (fillTwoSupports && !isFourPlayerRaid(raidId)) {
    for (let i = 0; i < runs.length; i++) {
      while (supCount(runs[i]) < 2) {
        let moved = false;
        for (let j = runs.length - 1; j > i; j--) {
          const donor = runs[j];
          const supIdx = donor.findIndex((m) => m.role === 'SUPPORT');
          if (supIdx === -1) continue;

          const sup = donor[supIdx];
          if (buildPlayerSet(runs[i]).has(sup.discordName)) continue;

          if (!canAddToRunLocalSearch(raidId, runs, i, sup, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
          if (!donorValidAfterRemoval(donor, sup.id)) continue;

          donor.splice(supIdx, 1);
          runs[i].push(sup);
          moved = true;
          break;
        }
        if (!moved) break;
      }
    }
  }

  for (let i = 0; i < runs.length; i++) {
    let capI = runCap(runs[i]);
    while (runs[i].length < capI) {
      let moved = false;
      const playersI = buildPlayerSet(runs[i]);

      for (let j = runs.length - 1; j > i; j--) {
        if (runs[j].length === 0) continue;

        const wantSupport = fillTwoSupports && !isFourPlayerRaid(raidId) && supCount(runs[i]) < 2;
        const candidates = [...runs[j]].sort((a, b) => {
          if (wantSupport && a.role !== b.role) return a.role === 'SUPPORT' ? -1 : 1;
          return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
        });

        for (const ch of candidates) {
          if (lockIds.has(ch.id)) continue; // 🔒 잠긴 캐릭 이동 불가
          if (playersI.has(ch.discordName)) continue;

          if (!canAddToRunLocalSearch(raidId, runs, i, ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
          if (!donorValidAfterRemoval(runs[j], ch.id)) continue;

          runs[j] = runs[j].filter((m) => m.id !== ch.id);
          runs[i].push(ch);
          moved = true;
          break;
        }
        if (moved) break;
      }
      if (!moved) break;
      capI = runCap(runs[i]);
    }
  }
  return runs.filter((r) => r.length > 0);
}

function optimizeRunsByStdDev(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  dim: BalanceDimension,
  random: () => number,
  concurrentRuns: number,
  lockIds: Set<string> = new Set(),
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
    while (to === from && guard < 5) { to = Math.floor(random() * runCount); guard++; }
    if (to === from) continue;

    const fromRun = runs[from];
    const toRun = runs[to];

    if (!canAddToRunLocalSearch(raidId, runs, to, ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;

    const idxInFrom = fromRun.findIndex((m) => m.id === ch.id);
    if (idxInFrom === -1) continue;

    fromRun.splice(idxInFrom, 1);
    toRun.push(ch);

    if (!isRunValid(raidId, fromRun, maxPerRun, maxSupportsPerRun) || !isRunValid(raidId, toRun, maxPerRun, maxSupportsPerRun)) {
      toRun.pop();
      fromRun.splice(idxInFrom, 0, ch);
      continue;
    }

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

function optimizeCombatPowerBySwapOnly(
  raidId: RaidId,
  runsMembers: Character[][],
  maxSupportsPerRun: number,
  maxPerRun: number,
  dim: BalanceDimension,
  random: () => number,
  concurrentRuns: number,
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

    const canSwap = (targetRunIdx: number, cFrom: Character, cTo: Character) => {
      const toRun = runs[targetRunIdx];
      if (toRun.some((m) => m.id !== cTo.id && m.discordName === cFrom.discordName)) return false;

      if (concurrentRuns > 1) {
        const targetWave = Math.floor(targetRunIdx / concurrentRuns);
        const waveStart = targetWave * concurrentRuns;
        const waveEnd = waveStart + concurrentRuns;
        for (let i = waveStart; i < waveEnd && i < runs.length; i++) {
          if (i === targetRunIdx) continue;
          if (runs[i].some((m) => m.id !== cTo.id && m.discordName === cFrom.discordName)) return false;
        }
      }

      if (cFrom.role === 'DPS') {
        const sameJobCount = toRun.filter((m) => m.id !== cTo.id && m.role === 'DPS' && m.jobCode === cFrom.jobCode).length;
        if (sameJobCount >= maxSameJobDps) return false;
      } else {
        const supCount = toRun.filter((m) => m.id !== cTo.id && m.role === 'SUPPORT').length;
        if (supCount >= maxSupportsPerRun) return false;
      }
      return true;
    };

    if (!canSwap(r2, char1, char2)) continue;
    if (!canSwap(r1, char2, char1)) continue;

    runs[r1][c1Idx] = char2;
    runs[r2][c2Idx] = char1;

    if (!isRunValid(raidId, runs[r1], maxPerRun, maxSupportsPerRun) || !isRunValid(raidId, runs[r2], maxPerRun, maxSupportsPerRun)) {
      runs[r1][c1Idx] = char1;
      runs[r2][c2Idx] = char2;
      continue;
    }

    const newCost = computeRunsCost(runs, dim);
    if (newCost < bestCost) bestCost = newCost;
    else {
      runs[r1][c1Idx] = char1;
      runs[r2][c2Idx] = char2;
    }
  }
  return runs;
}

// ✅ lockIds 추가 적용
function compactRunsFrontloadedForSpeed(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  concurrentRuns: number,
  lockIds: Set<string> = new Set(), // 🔒 추가됨
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

        const candidates = [...runs[j]].sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

        for (const ch of candidates) {
          if (lockIds.has(ch.id)) continue; // 🔒 잠긴 캐릭 이동 불가

          if (!canAddToRunGreedy(raidId, runs, i, countsI, ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;

          const nextI = [...runs[i], ch];
          const nextJ = runs[j].filter((m) => m.id !== ch.id);

          if (!isRunValid(raidId, nextI, maxPerRun, maxSupportsPerRun)) continue;
          if (!isRunValid(raidId, nextJ, maxPerRun, maxSupportsPerRun)) continue;

          runs[j] = nextJ;
          runs[i] = nextI;
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

function minimizeSameJobInRuns(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  concurrentRuns: number,
  lockIds: Set<string>,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  const dupThreshold = isFourPlayerRaid(raidId) ? 2 : 3;
  const keepUntil = isFourPlayerRaid(raidId) ? 1 : 2;
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
      if (lockIds.has(ch.id)) continue;
      if (ch.role !== 'DPS') continue;
      if (!duplicatedJobCodes.includes(ch.jobCode)) continue;
      if (jobCounts[ch.jobCode] <= keepUntil) continue;

      for (let targetIdx = 0; targetIdx < runCount; targetIdx++) {
        if (targetIdx === ri) continue;

        const targetRun = runs[targetIdx];
        const sameJobInTargetCount = targetRun.filter((m) => m.role === 'DPS' && m.jobCode === ch.jobCode).length;
        if (sameJobInTargetCount >= targetMaxSameJob) continue;

        const targetCounts = buildPlayerCounts(targetRun);
        if (!canAddToRunGreedy(raidId, runs, targetIdx, targetCounts, ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;

        const nextSrc = run.filter((m) => m.id !== ch.id);
        const nextDst = [...targetRun, ch];

        if (!isRunValid(raidId, nextSrc, maxPerRun, maxSupportsPerRun)) continue;
        if (!isRunValid(raidId, nextDst, maxPerRun, maxSupportsPerRun)) continue;

        runs[ri] = nextSrc;
        runs[targetIdx] = nextDst;
        jobCounts[ch.jobCode]--;
        break;
      }
    }
  }
  return runs;
}

function swapSameUserCharactersToFixDuplicates(raidId: RaidId, runsMembers: Character[][], maxPerRun: number, maxSupportsPerRun: number, concurrentRuns: number, lockIds: Set<string>): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;
  const dupThreshold = isFourPlayerRaid(raidId) ? 2 : 3;

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
      if (lockIds.has(ch.id)) continue;
      if (ch.role !== 'DPS') continue;
      if (!dupJobs.includes(ch.jobCode)) continue;

      type SwapCandidate = { runIdx: number; charIdx: number; char: Character };
      const candidates: SwapCandidate[] = [];

      for (let targetRi = 0; targetRi < runCount; targetRi++) {
        if (targetRi === ri) continue;
        const targetRun = runs[targetRi];

        for (let tIdx = 0; tIdx < targetRun.length; tIdx++) {
          const t = targetRun[tIdx];
          if (lockIds.has(t.id)) continue;

          if (t.discordName !== ch.discordName) continue;
          if (t.id === ch.id) continue;
          if (t.role !== 'DPS') continue;

          if (targetRun.some((m) => m.id !== t.id && m.jobCode === ch.jobCode)) continue;
          if (run.some((m) => m.id !== ch.id && m.jobCode === t.jobCode)) continue;
          candidates.push({ runIdx: targetRi, charIdx: tIdx, char: t });
        }
      }

      if (candidates.length === 0) continue;
      let bestCand: SwapCandidate | null = null;
      let minDiff = Infinity;

      for (const cand of candidates) {
        const diff = Math.abs(ch.combatPower - cand.char.combatPower);
        if (diff < minDiff) { minDiff = diff; bestCand = cand; }
      }
      if (!bestCand) continue;

      const targetRun = runs[bestCand.runIdx];
      const myIdx = run.findIndex((m) => m.id === ch.id);
      if (myIdx === -1) continue;

      const targetChar = targetRun[bestCand.charIdx];
      
      if (concurrentRuns > 1) {
        let conflict = false;
        const targetWave = Math.floor(bestCand.runIdx / concurrentRuns);
        const sourceWave = Math.floor(ri / concurrentRuns);

        for (let i = targetWave * concurrentRuns; i < targetWave * concurrentRuns + concurrentRuns; i++) {
          if (i === bestCand.runIdx) continue;
          if (runs[i].some(m => m.discordName === ch.discordName)) conflict = true;
        }
        for (let i = sourceWave * concurrentRuns; i < sourceWave * concurrentRuns + concurrentRuns; i++) {
          if (i === ri) continue;
          if (runs[i].some(m => m.discordName === targetChar.discordName)) conflict = true;
        }
        if (conflict) continue;
      }

      const nextSrc = [...run];
      const nextDst = [...targetRun];

      nextSrc[myIdx] = targetChar;
      nextDst[bestCand.charIdx] = ch;

      if (!isRunValid(raidId, nextSrc, maxPerRun, maxSupportsPerRun)) continue;
      if (!isRunValid(raidId, nextDst, maxPerRun, maxSupportsPerRun)) continue;

      runs[ri] = nextSrc;
      runs[bestCand.runIdx] = nextDst;
      jobCounts[ch.jobCode] = (jobCounts[ch.jobCode] || 0) - 1;
      jobCounts[targetChar.jobCode] = (jobCounts[targetChar.jobCode] || 0) + 1;
    }
  }
  return runs;
}

function groupCharactersByRaid(characters: Character[], exclusions: RaidExclusionMap = {}): RaidBucket[] {
  const map: Record<RaidId, Character[]> = {
    ACT1_HARD: [], ACT2_NORMAL: [], ACT3_NORMAL: [], ACT2_HARD: [], ACT3_HARD: [],
    ACT4_NORMAL: [], ACT4_HARD: [], SERKA_NORMAL: [], SERKA_HARD: [], SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [], FINAL_HARD: [], HORIZON_STEP1: [], HORIZON_STEP2: [], HORIZON_STEP3: [],
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
    characters: map[raidId].sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id)),
  }));
}

// ==========================================
// 🌟 런 구성 (외통수 방지 및 락 시스템 적용)
// ==========================================
function distributeCharactersIntoRuns(
  raidId: RaidId,
  characters: Character[],
  balanceMode: BalanceMode,
  random: () => number,
  fillTwoSupports: boolean,
): RaidRun[] {
  if (characters.length === 0) return [];

  const cfg = getRaidConfig(raidId, fillTwoSupports);
  const maxSupportsPerRun = cfg.maxSupportsPerRun;
  const maxPerRun = getEffectiveMaxPerRun(raidId, characters, fillTwoSupports);
  const dim = getBalanceDimension(balanceMode);
  const speed = isSpeedMode(balanceMode);
  const lockIds = new Set<string>();

  const runCount = estimateRunCount(raidId, characters, fillTwoSupports);

  const uniqueUsersCount = new Set(characters.map(c => c.discordName)).size;
  const hasGuests = characters.some(c => c.isGuest);
  const concurrentRuns = hasGuests ? Math.ceil(uniqueUsersCount / maxPerRun) : 1;
  const is4Player = isFourPlayerRaid(raidId);

  let runsMembers: Character[][] = Array.from({ length: runCount }, () => [] as Character[]);
  const runsTotalPower: number[] = Array(runCount).fill(0);
  const runsDpsPower: number[] = Array(runCount).fill(0);
  const runsSupPower: number[] = Array(runCount).fill(0);
  const runsPlayerCounts: Array<Record<string, number>> = Array.from({ length: runCount }, () => ({}));

  const supports = characters
    .filter((c) => !lockIds.has(c.id) && c.role === 'SUPPORT')
    .slice()
    .sort((a, b) => {
      if (a.isGuest !== b.isGuest) return a.isGuest ? -1 : 1;
      return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
    });

  const dps = characters
    .filter((c) => !lockIds.has(c.id) && c.role === 'DPS')
    .slice()
    .sort((a, b) => {
      if (a.isGuest !== b.isGuest) return a.isGuest ? -1 : 1;
      return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
    });

  const targetSupPerRun = is4Player ? 1 : (fillTwoSupports ? 2 : 1);

  const placeIntoRun = (runIdx: number, ch: Character) => {
    runsMembers[runIdx].push(ch);
    runsTotalPower[runIdx] += ch.combatPower;
    if (ch.role === 'DPS') runsDpsPower[runIdx] += ch.combatPower;
    else runsSupPower[runIdx] += ch.combatPower;
    runsPlayerCounts[runIdx][ch.discordName] = (runsPlayerCounts[runIdx][ch.discordName] || 0) + 1;
  };

  // 1. 서폿 먼저 배치
  for (const sup of supports) {
    let best = -1;
    let bestScore: [number, number, number, number] | null = null;
    
    for (let i = 0; i < runsMembers.length; i++) {
      const run = runsMembers[i];
      const supCnt = run.filter((m) => m.role === 'SUPPORT').length;
      if (supCnt >= targetSupPerRun) continue;
      
      if (!canAddToRunGreedy(raidId, runsMembers, i, runsPlayerCounts[i], sup, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;

      const isGuestRun = run.some((m) => m.isGuest) ? 0 : 1;
      const score: [number, number, number, number] = [isGuestRun, supCnt, -run.length, i];
      
      if (!bestScore || 
          score[0] < bestScore[0] || 
          (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
          (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])) {
        bestScore = score;
        best = i;
      }
    }

    if (best === -1) {
      let bestSize = -1;
      let bestIsGuest = false;
      for (let i = 0; i < runsMembers.length; i++) {
        if (!canAddToRunGreedy(raidId, runsMembers, i, runsPlayerCounts[i], sup, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
        
        const isGuestRun = runsMembers[i].some((m) => m.isGuest);
        const size = runsMembers[i].length;

        if (isGuestRun && !bestIsGuest) {
          bestSize = size;
          best = i;
          bestIsGuest = true;
        } else if (isGuestRun === bestIsGuest && size > bestSize) {
          bestSize = size;
          best = i;
        }
      }
    }

    if (best === -1) {
      best = runsMembers.length;
      runsMembers.push([]);
      runsTotalPower.push(0); runsDpsPower.push(0); runsSupPower.push(0);
      runsPlayerCounts.push({});
    }
    placeIntoRun(best, sup);
  }

  let regularDps = [...dps];

  // 🌟 [핵심 변경] 옵션 A: 외통수 방지 로직 (MRV - 갈 곳 없는 약한 애들부터 꽂아넣기)
  if (is4Player) {
    const supRunIdxs: number[] = [];
    for (let i = 0; i < runsMembers.length; i++) {
      if (runsMembers[i].some((m) => m.role === 'SUPPORT')) {
        supRunIdxs.push(i);
      }
    }

    if (supRunIdxs.length > 0) {
      const totalCharsCount = characters.length;
      const fullRunCount = Math.floor(totalCharsCount / 4);
      const safeSupRuns = supRunIdxs.slice(0, fullRunCount);

      const nonGuestDps = regularDps.filter(c => !c.isGuest);
      const extractCount = Math.min(safeSupRuns.length, nonGuestDps.length);
      
      let weakestDps = nonGuestDps.slice(-extractCount);
      const weakestIds = new Set(weakestDps.map(c => c.id));
      
      regularDps = regularDps.filter(c => !weakestIds.has(c.id));

      const runsWeakCount = new Array(runsMembers.length).fill(0);
      const assignedWeakIds = new Set<string>();

      const getValidRunCount = (ch: Character) => {
        let count = 0;
        for(const idx of safeSupRuns) {
          if (canAddToRunGreedy(raidId, runsMembers, idx, runsPlayerCounts[idx], ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) {
            count++;
          }
        }
        return count;
      };

      // 🌟 [Tiebreaker] 들어갈 수 있는 방 개수가 같으면 "가장 약한 애"가 먼저 차지하도록 확실히 정렬
      weakestDps.sort((a, b) => {
        const countDiff = getValidRunCount(a) - getValidRunCount(b);
        if (countDiff !== 0) return countDiff;
        return a.combatPower - b.combatPower; 
      });

      for (const ch of weakestDps) {
        let placedIdx = -1;
        
        let bestValidRuns = safeSupRuns.filter(idx => 
          runsWeakCount[idx] < 1 && 
          canAddToRunGreedy(raidId, runsMembers, idx, runsPlayerCounts[idx], ch, maxPerRun, maxSupportsPerRun, concurrentRuns)
        );

        if (bestValidRuns.length > 0) {
          bestValidRuns.sort((a, b) => runsMembers[a].filter(m=>m.role==='DPS').length - runsMembers[b].filter(m=>m.role==='DPS').length);
          placedIdx = bestValidRuns[0];
        } else {
          for (const targetIdx of supRunIdxs) {
            if (runsWeakCount[targetIdx] >= 1) continue;
            if (!canAddToRunGreedy(raidId, runsMembers, targetIdx, runsPlayerCounts[targetIdx], ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
            placedIdx = targetIdx;
            break;
          }
        }

        if (placedIdx !== -1) {
          placeIntoRun(placedIdx, ch);
          lockIds.add(ch.id); // 🔒 잠금 발동
          assignedWeakIds.add(ch.id);
          runsWeakCount[placedIdx]++;
        } else {
          regularDps.push(ch); // 갈 곳 없으면 방출
        }
      }

      regularDps.sort((a, b) => {
        if (a.isGuest !== b.isGuest) return a.isGuest ? -1 : 1;
        return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
      });
    }
  }

  // 2. 나머지 딜러들을 정상적으로 배치
  for (const ch of regularDps) {
    let bestIndex = -1;
    const currentRunCount = runsMembers.length;

    if (speed) {
      let bestTuple: [number, number, number, number] | null = null;
      for (let i = 0; i < currentRunCount; i++) {
        if (!canAddToRunGreedy(raidId, runsMembers, i, runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
        
        const isGuestRun = runsMembers[i].some((m) => m.isGuest) ? 1 : 0;
        const supCnt = runsMembers[i].filter((m) => m.role === 'SUPPORT').length;
        const size = runsMembers[i].length;
        const tuple: [number, number, number, number] = [isGuestRun, supCnt, size, i];

        if (!bestTuple) bestTuple = tuple;
        else if (tuple[0] > bestTuple[0]) bestTuple = tuple;
        else if (tuple[0] === bestTuple[0] && tuple[1] > bestTuple[1]) bestTuple = tuple;
        else if (tuple[0] === bestTuple[0] && tuple[1] === bestTuple[1] && tuple[2] > bestTuple[2]) bestTuple = tuple;
      }
      if (bestTuple) bestIndex = bestTuple[3];
    } else {
      let bestScore: [number, number, number, number, number] | null = null;
      for (let i = 0; i < currentRunCount; i++) {
        if (!canAddToRunGreedy(raidId, runsMembers, i, runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
        
        const isGuestRun = runsMembers[i].some((m) => m.isGuest) ? 0 : 1;
        const metric = dim === 'overall' ? runsTotalPower[i] : runsDpsPower[i];
        const supCnt = runsMembers[i].filter((m) => m.role === 'SUPPORT').length;
        const supBoost = fillTwoSupports && !is4Player ? supCnt : 0;
        const score: [number, number, number, number, number] = [isGuestRun, metric, -supBoost, runsMembers[i].length, i];

        if (
          !bestScore ||
          score[0] < bestScore[0] ||
          (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
          (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
        ) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);

    if (bestIndex === -1) {
      let bestSize = -1;
      let bestIsGuest = false;
      for (let i = 0; i < currentRunCount; i++) {
        const run = runsMembers[i];
        const size = run.length;
        if (size >= maxPerRun) continue;
        if (runsPlayerCounts[i][ch.discordName]) continue;

        const sameJob = run.filter((m) => m.role === 'DPS' && m.jobCode === ch.jobCode).length;
        if (sameJob >= maxSameJobDps) continue;

        if (!canAddToRunGreedy(raidId, runsMembers, i, runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun, concurrentRuns)) continue;
        
        const isGuestRun = run.some((m) => m.isGuest);
        if (isGuestRun && !bestIsGuest) {
          bestSize = size;
          bestIndex = i;
          bestIsGuest = true;
        } else if (isGuestRun === bestIsGuest && size > bestSize) {
          bestSize = size;
          bestIndex = i;
        }
      }
    }

    if (bestIndex === -1) {
      bestIndex = runsMembers.length;
      runsMembers.push([]);
      runsTotalPower.push(0); runsDpsPower.push(0); runsSupPower.push(0);
      runsPlayerCounts.push({});
    }
    placeIntoRun(bestIndex, ch);
  }

  runsMembers.sort((a, b) => {
    const aGuest = a.some((m) => m.isGuest) ? 1 : 0;
    const bGuest = b.some((m) => m.isGuest) ? 1 : 0;
    return bGuest - aGuest;
  });

  let stage1 = packSupportsToTwoPerRunIfPossible(raidId, runsMembers, maxPerRun, maxSupportsPerRun, fillTwoSupports, concurrentRuns);
  
  // ✅ 락이 걸린 캐릭터가 휩쓸려 가지 않도록 lockIds 전달
  stage1 = maximizeRunsFrontloaded(raidId, stage1, maxPerRun, maxSupportsPerRun, fillTwoSupports, concurrentRuns, lockIds);

  let optimized: Character[][];
  if (speed) {
    optimized = optimizeCombatPowerBySwapOnly(raidId, stage1, maxSupportsPerRun, maxPerRun, dim, random, concurrentRuns, lockIds);
    optimized = compactRunsFrontloadedForSpeed(raidId, optimized, maxPerRun, maxSupportsPerRun, concurrentRuns, lockIds);
  } else {
    optimized = optimizeRunsByStdDev(raidId, stage1, maxPerRun, maxSupportsPerRun, dim, random, concurrentRuns, lockIds);
  }

  optimized = minimizeSameJobInRuns(raidId, optimized, maxPerRun, maxSupportsPerRun, concurrentRuns, lockIds);
  optimized = swapSameUserCharactersToFixDuplicates(raidId, optimized, maxPerRun, maxSupportsPerRun, concurrentRuns, lockIds);
  optimized = packSupportsToTwoPerRunIfPossible(raidId, optimized, maxPerRun, maxSupportsPerRun, fillTwoSupports, concurrentRuns);
  optimized = maximizeRunsFrontloaded(raidId, optimized, maxPerRun, maxSupportsPerRun, fillTwoSupports, concurrentRuns, lockIds);

  const arrangedRuns: Character[][] = [];
  const remainingRuns = [...optimized];

  while (remainingRuns.length > 0) {
    let targetIdx = remainingRuns.findIndex((r) => r.some((m) => m.isGuest));
    if (targetIdx === -1) {
      let maxSize = -1;
      targetIdx = 0;
      for (let i = 0; i < remainingRuns.length; i++) {
        if (remainingRuns[i].length > maxSize) {
          maxSize = remainingRuns[i].length;
          targetIdx = i;
        }
      }
    }

    const mainRun = remainingRuns.splice(targetIdx, 1)[0];
    arrangedRuns.push(mainRun);

    if (mainRun.some((m) => m.isGuest)) {
      let neededPartners = concurrentRuns - 1;
      const waveUsers = new Set(mainRun.filter((m) => !m.isGuest).map((m) => m.discordName));

      while (neededPartners > 0) {
        const partnerIdx = remainingRuns.findIndex((r) => {
          return !r.some((m) => !m.isGuest && waveUsers.has(m.discordName));
        });

        if (partnerIdx !== -1) {
          const partnerRun = remainingRuns.splice(partnerIdx, 1)[0];
          arrangedRuns.push(partnerRun);
          partnerRun.filter((m) => !m.isGuest).forEach((m) => waveUsers.add(m.discordName));
        }
        neededPartners--;
      }
    }
  }

  optimized = arrangedRuns; 

  const runs: RaidRun[] = [];
  optimized.forEach((members, idx) => {
    if (members.length === 0) return;
    const parties = splitIntoPartiesLossless(members, raidId);
    if (parties.length === 0) return;
    const avgPower = members.reduce((sum, c) => sum + c.combatPower, 0) / members.length;
    runs.push({
      raidId,
      runIndex: idx + 1,
      parties,
      averageCombatPower: Math.round(avgPower),
    });
  });

  return rebalanceSupportsGlobal(runs, concurrentRuns);
}

function splitIntoPartiesLossless(members: Character[], raidId: RaidId): RaidRunParty[] {
  const is4Player = isFourPlayerRaid(raidId);
  const supports = [...members].filter((m) => m.role === 'SUPPORT').sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));
  const dps = [...members].filter((m) => m.role === 'DPS').sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  let partyCount = 1;
  if (!is4Player) {
    const noSupportRun = supports.length === 0;
    if (members.length > 4) partyCount = 2;
    else if (members.length === 4 && noSupportRun) partyCount = 2;
    else partyCount = 1;
  }
  partyCount = Math.min(is4Player ? 1 : 2, partyCount);

  const parties: FixedRaidRunParty[] = Array.from({ length: partyCount }, (_, idx) => ({ partyIndex: idx + 1, members: [] }));
  const usedIds = new Set<string>();

  const maxSize = (party: FixedRaidRunParty) => {
    if (is4Player) return 4;
    return party.members.some((m) => m.role === 'SUPPORT') ? 4 : 3;
  };

  const addMember = (party: FixedRaidRunParty, c: Character) => {
    if (party.members.length >= maxSize(party)) return false;
    party.members.push(c);
    usedIds.add(c.id);
    return true;
  };

  for (let i = 0; i < parties.length; i++) {
    const sup = supports.find((s) => !usedIds.has(s.id));
    if (sup) addMember(parties[i], sup);
  }

  let placed = true;
  while (placed) {
    placed = false;
    for (let i = 0; i < parties.length; i++) {
      const p = parties[i];
      if (p.members.length >= maxSize(p)) continue;
      const distinctDps = dps.find((d) => !usedIds.has(d.id) && !p.members.some((m) => m.role === 'DPS' && m.jobCode === d.jobCode));
      if (distinctDps) { addMember(p, distinctDps); placed = true; }
    }
    if (!placed) break;

    placed = false;
    for (let i = parties.length - 1; i >= 0; i--) {
      const p = parties[i];
      if (p.members.length >= maxSize(p)) continue;
      const distinctDps = dps.find((d) => !usedIds.has(d.id) && !p.members.some((m) => m.role === 'DPS' && m.jobCode === d.jobCode));
      if (distinctDps) { addMember(p, distinctDps); placed = true; }
    }
  }

  [...supports, ...dps].forEach((c) => {
    if (!usedIds.has(c.id)) {
      for (const p of parties) { if (addMember(p, c)) break; }
    }
  });

  return parties.filter((p) => p.members.length > 0) as unknown as RaidRunParty[];
}

function rebalanceSupportsGlobal(runs: RaidRun[], concurrentRuns: number): RaidRun[] {
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
    return members.reduce((sum, m) => sum + m.combatPower, 0) / members.length;
  };

  const allParties: Array<{ runIndex: number; partyIndex: number; party: FixedRaidRunParty }> = [];
  result.forEach((run, ri) => {
    (run.parties as unknown as FixedRaidRunParty[]).forEach((p, pi) => allParties.push({ runIndex: ri, partyIndex: pi, party: p }));
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
    let bestAvg = targetRunAvg <= globalMedian ? -Infinity : Infinity;

    donors.forEach((donor, idx) => {
      const sup = donor.party.members.find((m) => m.role === 'SUPPORT');
      if (!sup) return;
      if (result[target.runIndex].parties.flatMap(p => p.members).some(m => m.discordName === sup.discordName)) return;

      if (concurrentRuns > 1) {
        let conflict = false;
        const targetWave = Math.floor(target.runIndex / concurrentRuns);
        for (let i = targetWave * concurrentRuns; i < targetWave * concurrentRuns + concurrentRuns; i++) {
          if (i === target.runIndex) continue;
          if (result[i]?.parties.flatMap(p => p.members).some((m: Character) => m.discordName === sup.discordName)) {
            conflict = true; break;
          }
        }
        if (conflict) return;
      }

      const donorAvg = runAvgs[donor.runIndex];
      if ((targetRunAvg <= globalMedian && donorAvg > bestAvg) || (targetRunAvg > globalMedian && donorAvg < bestAvg)) {
        bestAvg = donorAvg;
        bestDonorIdx = idx;
      }
    });

    if (bestDonorIdx === -1) continue;

    const donor = donors.splice(bestDonorIdx, 1)[0];
    const supIndex = donor.party.members.findIndex((m) => m.role === 'SUPPORT');
    if (supIndex === -1) continue;

    const sup = donor.party.members.splice(supIndex, 1)[0];
    target.party.members.push(sup);
  }

  return result;
}

function cloneSchedule(schedule: RaidSchedule): RaidSchedule {
  const result: RaidSchedule = {
    ACT1_HARD: [], ACT2_NORMAL: [], ACT3_NORMAL: [], ACT2_HARD: [], ACT3_HARD: [],
    ACT4_NORMAL: [], ACT4_HARD: [], SERKA_NORMAL: [], SERKA_HARD: [], SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [], FINAL_HARD: [], HORIZON_STEP1: [], HORIZON_STEP2: [], HORIZON_STEP3: [],
  };

  (Object.keys(result) as RaidId[]).forEach((raidId) => {
    const runs = schedule[raidId] ?? [];
    result[raidId] = runs.map((run) => ({
      ...run,
      parties: run.parties.map((p) => ({ ...p, members: [...p.members] })),
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
        parties: run.parties.map((p) => ({ ...p, members: p.members.filter((m) => !excluded.has(m.id)) })).filter((p) => p.members.length > 0),
      })).filter((run) => run.parties.length > 0);
  });
  return next;
}

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

function enforceSerkaDpsCapOnSchedule(schedule: RaidSchedule): RaidSchedule {
  const next = cloneSchedule(schedule);
  const raidIds: RaidId[] = ['SERKA_NORMAL', 'SERKA_HARD', 'SERKA_NIGHTMARE'];

  const recomputeAvg = (run: RaidRun): RaidRun => {
    const members = (run.parties as unknown as FixedRaidRunParty[]).flatMap((p) => p.members);
    if (!members.length) return { ...run, averageCombatPower: 0 };
    return { ...run, averageCombatPower: Math.round(members.reduce((s, m) => s + m.combatPower, 0) / members.length) };
  };

  const getConcurrentRuns = (raidId: RaidId, runs: RaidRun[]) => {
    const allMembers = runs.flatMap(r => r.parties.flatMap(p => p.members));
    const hasGuests = allMembers.some(m => m.isGuest);
    if (!hasGuests) return 1;
    const uniqueUsers = new Set(allMembers.map(m => m.discordName)).size;
    const cfg = getRaidConfig(raidId, false);
    return Math.ceil(uniqueUsers / cfg.maxPerRun);
  };

  for (const raidId of raidIds) {
    const runs = next[raidId] ?? [];
    if (runs.length <= 1) continue;

    const concurrentRuns = getConcurrentRuns(raidId, runs);
    const getRunMembers = (ri: number): Character[] => ((runs[ri].parties[0] as unknown) as FixedRaidRunParty).members;
    const supCount = (members: Character[]) => members.filter((m) => m.role === 'SUPPORT').length;
    const hasUser = (members: Character[], discordName: string) => members.some((m) => m.discordName === discordName);

    let changed = true;
    let guard = 0;

    while (changed && guard < 200) {
      guard++;
      changed = false;

      const srcIdx = runs.findIndex((_, idx) => getRunMembers(idx).length === 4 && supCount(getRunMembers(idx)) === 0);
      if (srcIdx === -1) break;

      const srcMembers = getRunMembers(srcIdx);
      const mover = [...srcMembers].filter((m) => m.role === 'DPS').sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id))[0];
      if (!mover) break;

      let bestDstIdx = -1;
      let bestSize = -1;

      for (let di = 0; di < runs.length; di++) {
        if (di === srcIdx) continue;
        const dstMembers = getRunMembers(di);

        if (dstMembers.length >= 4) continue;
        if (supCount(dstMembers) <= 0) continue;
        if (hasUser(dstMembers, mover.discordName)) continue;

        if (concurrentRuns > 1) {
          let conflict = false;
          const targetWave = Math.floor(di / concurrentRuns);
          for (let i = targetWave * concurrentRuns; i < targetWave * concurrentRuns + concurrentRuns; i++) {
            if (i === di) continue;
            if (getRunMembers(i).some((m) => m.discordName === mover.discordName)) {
              conflict = true; break;
            }
          }
          if (conflict) continue;
        }

        const sameJobDps = dstMembers.filter((m) => m.role === 'DPS' && m.jobCode === mover.jobCode).length;
        if (sameJobDps >= 1) continue;

        if (dstMembers.length > bestSize) {
          bestSize = dstMembers.length;
          bestDstIdx = di;
        }
      }

      if (bestDstIdx === -1) break;

      const removeIdx = srcMembers.findIndex((m) => m.id === mover.id);
      if (removeIdx === -1) break;

      srcMembers.splice(removeIdx, 1);
      getRunMembers(bestDstIdx).push(mover);

      runs[srcIdx] = recomputeAvg(runs[srcIdx]);
      runs[bestDstIdx] = recomputeAvg(runs[bestDstIdx]);
      changed = true;
    }
    next[raidId] = runs;
  }
  return next;
}

// ==============================
// ✅ 빌드 스케줄
// ==============================
export function buildRaidSchedule(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  balanceMode: BalanceMode = 'speed',
  raidSettings: RaidSettingsMap = {},
  swaps: RaidSwap[] = [],
  guests: Partial<Record<RaidId, Character[]>> = {},
): RaidSchedule {
  const activeCharacters = characters.filter((c) => c.isParticipating !== false);
  const filtered = activeCharacters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered, exclusions);
  const SEED = 123456789;
  const seededRng = createSeededRandom(SEED);

  const schedule: RaidSchedule = {
    ACT1_HARD: [], ACT2_NORMAL: [], ACT3_NORMAL: [], ACT2_HARD: [], ACT3_HARD: [],
    ACT4_NORMAL: [], ACT4_HARD: [], SERKA_NORMAL: [], SERKA_HARD: [], SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [], FINAL_HARD: [], HORIZON_STEP1: [], HORIZON_STEP2: [], HORIZON_STEP3: [],
  };

  buckets.forEach(({ raidId, characters }) => {
    if (raidId === 'ACT1_HARD' || raidId === 'ACT2_NORMAL' || raidId === 'ACT2_HARD' || raidId === 'ACT3_NORMAL' || raidId === 'ACT3_HARD') return;
    const fillTwoSupports = Boolean(raidSettings?.[raidId]);

    const pool = fillTwoSupports ? promoteValkyToSupportIfNeeded(raidId, characters, fillTwoSupports) : characters;
    const raidGuests = guests[raidId] || [];
    const poolWithGuests = [...pool, ...raidGuests];

    if (schedule[raidId] !== undefined) {
      schedule[raidId] = buildRunsWithFixedPresets(
        raidId,
        poolWithGuests,
        balanceMode,
        seededRng,
        fillTwoSupports,
      );
    }
  });

  const scheduleWithSwaps = applySwaps(schedule, swaps, characters);
  const scheduleWithExclusions = enforceExclusions(scheduleWithSwaps, exclusions);

  return enforceSerkaDpsCapOnSchedule(scheduleWithExclusions);
}

export function buildRaidCandidatesMap(characters: Character[], exclusions: RaidExclusionMap = {}, raidSettings: RaidSettingsMap = {}): Record<RaidId, Character[]> {
  const activeCharacters = characters.filter((c) => c.isParticipating !== false);
  const filtered = activeCharacters.filter((c) => c.itemLevel >= 1680);
  const map: Record<RaidId, Character[]> = {
    ACT1_HARD: [], ACT2_NORMAL: [], ACT3_NORMAL: [], ACT2_HARD: [], ACT3_HARD: [],
    ACT4_NORMAL: [], ACT4_HARD: [], SERKA_NORMAL: [], SERKA_HARD: [], SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [], FINAL_HARD: [], HORIZON_STEP1: [], HORIZON_STEP2: [], HORIZON_STEP3: [],
  };

  filtered.forEach((ch) => {
    const targetRaids = getTargetRaidsForCharacter(ch);
    targetRaids.forEach((raidId) => { if (map[raidId]) map[raidId].push(ch); });
  });

  (Object.keys(map) as RaidId[]).forEach((raidId) => {
    const list = map[raidId];
    if (list.length === 0) return;

    const byId = new Map<string, Character>();
    list.forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });

    const unique = Array.from(byId.values()).sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));
    const fillTwoSupports = Boolean(raidSettings?.[raidId]);

    if (fillTwoSupports) {
      const excludedIds = new Set(exclusions?.[raidId] ?? []);
      const remaining = unique.filter((c) => !excludedIds.has(c.id));
      const promotedRemaining = promoteValkyToSupportIfNeeded(raidId, remaining, fillTwoSupports);
      const promotedById = new Map(promotedRemaining.map((c) => [c.id, c]));
      map[raidId] = unique.map((c) => promotedById.get(c.id) ?? c);
    } else {
      map[raidId] = unique;
    }
  });

  return map;
}

export interface HoldbackRecommendation {
  discordName: string;
  heldDps: Character[];
  heldSup: Character[];
}

export interface AbsenteeActionReport {
  raidId: RaidId;
  absentChars: Character[];
  recommendations: HoldbackRecommendation[];
  shortageDps: number;
  shortageSup: number;
  freeDps: Character[];
  freeSup: Character[];
}

function sortByHoldbackPriority(a: Character, b: Character): number {
  if (a.combatPower !== b.combatPower) {
    return a.combatPower - b.combatPower;
  }
  if (a.itemLevel !== b.itemLevel) {
    return a.itemLevel - b.itemLevel;
  }
  return String(a.id).localeCompare(String(b.id));
}

function sortByDisplayPriority(a: Character, b: Character): number {
  if (a.combatPower !== b.combatPower) {
    return b.combatPower - a.combatPower;
  }
  if (a.itemLevel !== b.itemLevel) {
    return b.itemLevel - a.itemLevel;
  }
  return a.discordName.localeCompare(b.discordName, 'ko');
}

function pickBalancedHoldbacks(
  chars: Character[],
  count: number,
  maxPerUser: number,
  userPickCount: Record<string, number>,
): Character[] {
  if (count <= 0 || maxPerUser <= 0 || chars.length === 0) return [];

  const byUser = new Map<string, Character[]>();

  for (const ch of chars) {
    if (!byUser.has(ch.discordName)) {
      byUser.set(ch.discordName, []);
    }
    byUser.get(ch.discordName)!.push(ch);
  }

  byUser.forEach((list) => {
    list.sort(sortByHoldbackPriority);
  });

  const selected: Character[] = [];

  while (selected.length < count) {
    const candidateUsers = Array.from(byUser.keys())
      .filter((userName) => {
        const remains = byUser.get(userName)?.length ?? 0;
        const picked = userPickCount[userName] || 0;
        return remains > 0 && picked < maxPerUser;
      })
      .sort((userA, userB) => {
        const pickedDiff =
          (userPickCount[userA] || 0) - (userPickCount[userB] || 0);
        if (pickedDiff !== 0) return pickedDiff;

        const nextA = byUser.get(userA)?.[0];
        const nextB = byUser.get(userB)?.[0];

        if (nextA && nextB) {
          const priorityDiff = sortByHoldbackPriority(nextA, nextB);
          if (priorityDiff !== 0) return priorityDiff;
        }

        return userA.localeCompare(userB, 'ko');
      });

    if (candidateUsers.length === 0) break;

    let progressed = false;

    for (const userName of candidateUsers) {
      if (selected.length >= count) break;

      const picked = userPickCount[userName] || 0;
      if (picked >= maxPerUser) continue;

      const nextChar = byUser.get(userName)?.shift();
      if (!nextChar) continue;

      selected.push(nextChar);
      userPickCount[userName] = picked + 1;
      progressed = true;
    }

    if (!progressed) break;
  }

  return selected;
}

function buildRecommendations(
  heldDps: Character[],
  heldSup: Character[],
): HoldbackRecommendation[] {
  const recsMap = new Map<string, HoldbackRecommendation>();

  const ensure = (discordName: string) => {
    if (!recsMap.has(discordName)) {
      recsMap.set(discordName, {
        discordName,
        heldDps: [],
        heldSup: [],
      });
    }
    return recsMap.get(discordName)!;
  };

  heldDps.forEach((char) => {
    ensure(char.discordName).heldDps.push(char);
  });

  heldSup.forEach((char) => {
    ensure(char.discordName).heldSup.push(char);
  });

  return Array.from(recsMap.values())
    .map((rec) => ({
      ...rec,
      heldDps: [...rec.heldDps].sort(sortByDisplayPriority),
      heldSup: [...rec.heldSup].sort(sortByDisplayPriority),
    }))
    .sort((a, b) => a.discordName.localeCompare(b.discordName, 'ko'));
}

export function calculateHoldbacksSpecific(
  absentUserNames: string | string[],
  allCharacters: Character[],
  exclusions: RaidExclusionMap,
): AbsenteeActionReport[] {
  const absentNames = Array.isArray(absentUserNames)
    ? Array.from(new Set(absentUserNames.filter(Boolean)))
    : [absentUserNames].filter(Boolean);

  if (absentNames.length === 0) return [];

  const absentSet = new Set(absentNames);
  const activeChars = allCharacters.filter(
    (c) => c.isParticipating !== false && !c.isGuest,
  );

  const remainingByRaid: Partial<Record<RaidId, Character[]>> = {};

  activeChars.forEach((ch) => {
    const targets = getTargetRaidsForCharacter(ch);
    targets.forEach((rId) => {
      if (!(exclusions[rId] || []).includes(ch.id)) {
        if (!remainingByRaid[rId]) remainingByRaid[rId] = [];
        remainingByRaid[rId]!.push(ch);
      }
    });
  });

  const reportList: AbsenteeActionReport[] = [];

  for (const [raidIdRaw, charsInRaid] of Object.entries(remainingByRaid)) {
    const raidId = raidIdRaw as RaidId;

    const absentChars = charsInRaid
      .filter((c) => absentSet.has(c.discordName))
      .sort(sortByDisplayPriority);

    if (absentChars.length === 0) continue;

    const resolvedPreset = resolveFixedPresetRunsForRaid(raidId, charsInRaid);

    const heldDps: Character[] = [];
    const heldSup: Character[] = [];
    const heldIds = new Set<string>();
    const handledAbsentIds = new Set<string>();

    let shortageDps = 0;
    let shortageSup = 0;

    // 1) 고정 파티에 속한 결석자는 그 파티의 나머지 멤버를 무조건 대기 처리
    if (resolvedPreset.presetRuns.length > 0) {
      const affectedRunIndexes = new Set<number>();

      absentChars.forEach((char) => {
        const fixedRunIndex = resolvedPreset.assignmentMap.get(char.id);
        if (!fixedRunIndex) return;

        affectedRunIndexes.add(fixedRunIndex);
        handledAbsentIds.add(char.id);

        if (char.role === 'SUPPORT') shortageSup += 1;
        else shortageDps += 1;
      });

      resolvedPreset.presetRuns.forEach((runMembers, idx) => {
        const runIndex = idx + 1;
        if (!affectedRunIndexes.has(runIndex)) return;

        runMembers.forEach((char) => {
          if (absentSet.has(char.discordName)) return;
          if (heldIds.has(char.id)) return;

          heldIds.add(char.id);
          if (char.role === 'SUPPORT') heldSup.push(char);
          else heldDps.push(char);
        });
      });
    }

    // 2) 고정 파티에 속하지 않은 결석 캐릭터는 기존 일반 규칙으로 계산
    const genericAbsentChars = absentChars.filter(
      (char) => !handledAbsentIds.has(char.id),
    );

    if (genericAbsentChars.length > 0) {
      const is4Man = isFourPlayerRaid(raidId);
      const absentDpsCount = genericAbsentChars.filter((c) => c.role === 'DPS').length;
      const absentSupCount = genericAbsentChars.filter((c) => c.role === 'SUPPORT').length;

      let requiredSup = 0;
      let requiredDps = 0;

      if (is4Man) {
        requiredSup = absentDpsCount * 1;
        requiredDps = absentDpsCount * 2 + absentSupCount * 3;
      } else {
        requiredSup = absentDpsCount * 2 + absentSupCount * 1;
        requiredDps = absentDpsCount * 5 + absentSupCount * 6;
      }

      const userPickCount: Record<string, number> = {};
      const limitPerUser = Math.max(1, genericAbsentChars.length);

      // 고정 파티 멤버는 다른 결석 보정용 대기자로 다시 차출하지 않음
      const genericPartnerPool = charsInRaid.filter(
        (char) =>
          !absentSet.has(char.discordName) &&
          !heldIds.has(char.id) &&
          !resolvedPreset.matchedIds.has(char.id),
      );

      const genericHeldSup = pickBalancedHoldbacks(
        genericPartnerPool.filter((c) => c.role === 'SUPPORT'),
        requiredSup,
        limitPerUser,
        userPickCount,
      );

      const genericHeldDps = pickBalancedHoldbacks(
        genericPartnerPool.filter((c) => c.role === 'DPS'),
        requiredDps,
        limitPerUser,
        userPickCount,
      );

      genericHeldSup.forEach((char) => {
        if (heldIds.has(char.id)) return;
        heldIds.add(char.id);
        heldSup.push(char);
      });

      genericHeldDps.forEach((char) => {
        if (heldIds.has(char.id)) return;
        heldIds.add(char.id);
        heldDps.push(char);
      });

      shortageSup += Math.max(0, requiredSup - genericHeldSup.length);
      shortageDps += Math.max(0, requiredDps - genericHeldDps.length);
    }

    const freeDps = charsInRaid
      .filter(
        (char) =>
          !absentSet.has(char.discordName) &&
          !heldIds.has(char.id) &&
          char.role === 'DPS',
      )
      .sort(sortByDisplayPriority);

    const freeSup = charsInRaid
      .filter(
        (char) =>
          !absentSet.has(char.discordName) &&
          !heldIds.has(char.id) &&
          char.role === 'SUPPORT',
      )
      .sort(sortByDisplayPriority);

    reportList.push({
      raidId,
      absentChars,
      recommendations: buildRecommendations(heldDps, heldSup),
      shortageDps,
      shortageSup,
      freeDps,
      freeSup,
    });
  }

  return reportList.sort((a, b) => {
    const aTop = Math.max(...a.absentChars.map((c) => c.itemLevel));
    const bTop = Math.max(...b.absentChars.map((c) => c.itemLevel));
    return bTop - aTop;
  });
}