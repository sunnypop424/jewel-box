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

function isFourPlayerRaid(raidId: RaidId): boolean {
  return raidId.startsWith('SERKA_') || raidId.startsWith('HORIZON_');
}

type RaidConfig = {
  maxPerRun: number; // 런 절대상한(세르카 4 / 그외 8)
  maxSupportsPerRun: number; // 런 내 서폿 최대(랏폿ON이면 2, OFF면 1)
  maxParties: number; // 런 내 파티 수(세르카 1 / 그외 2)
};

function getRaidConfig(raidId: RaidId, fillTwoSupports: boolean): RaidConfig {
  // ✅ 세르카: 4인 1파티, 서폿 최대 1
  if (isFourPlayerRaid(raidId)) {
    return { maxPerRun: 4, maxSupportsPerRun: 1, maxParties: 1 };
  }

  // ✅ 세르카 제외:
  // - 랏폿 체크 ON: 서폿 최대 2
  // - OFF: 서폿 최대 1
  return {
    maxPerRun: 8,
    maxSupportsPerRun: fillTwoSupports ? 2 : 1,
    maxParties: 2,
  };
}

// ✅ 런 인원 cap(핵심): "서폿 수"에 따라 달라짐
// 세르카: 서폿0 -> 3, 서폿1 -> 4
// 그외:   서폿0 -> 6, 서폿1 -> 7, 서폿2 -> 8
function getRunSizeCapBySupports(raidId: RaidId, supportCount: number): number {
  if (isFourPlayerRaid(raidId)) {
    return supportCount > 0 ? 4 : 3;
  }
  if (supportCount <= 0) return 6;
  if (supportCount === 1) return 7;
  return 8;
}

function getEffectiveMaxPerRun(
  raidId: RaidId,
  characters: Character[],
  fillTwoSupports: boolean,
): number {
  const cfg = getRaidConfig(raidId, fillTwoSupports);
  const uniqueUsers = new Set(characters.map((c) => c.discordName)).size;
  return Math.max(1, Math.min(cfg.maxPerRun, uniqueUsers));
}

function estimateRunCount(
  raidId: RaidId,
  characters: Character[],
  fillTwoSupports: boolean,
): number {
  if (characters.length === 0) return 0;

  const cfg = getRaidConfig(raidId, fillTwoSupports);
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

  // 랏폿 ON이면 supports/2 만큼 런 수가 확보돼야 "2서폿 런"을 만들 여지가 생김(강제 아님, 하한치만)
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

// ==========================================
// ✅ 레이드 선택 로직
// ==========================================
function getTargetRaidsForCharacter(ch: Character): RaidId[] {
  const il = ch.itemLevel;
  const raids: RaidId[] = [];

// 1) 지평의 성당
  if (il >= 1750) raids.push('HORIZON_STEP3');
  else if (il >= 1720) raids.push('HORIZON_STEP2');
  else if (il >= 1700) raids.push('HORIZON_STEP1');

  // 2) 세르카
  if (il >= 1740 && ch.serkaNightmare === true) raids.push('SERKA_NIGHTMARE');
  else if (il >= 1730) raids.push('SERKA_HARD');
  else if (il >= 1710) raids.push('SERKA_NORMAL');

  // 3) 종막
  if (il >= 1730) raids.push('FINAL_HARD');
  else if (il >= 1710) raids.push('FINAL_NORMAL');

  // 4) 4막
  if (il >= 1720) raids.push('ACT4_HARD');
  else if (il >= 1700) raids.push('ACT4_NORMAL');

  // 🌟 5) 3막, 2막, 1막 (1710 미만 캐릭터용)
  if (il < 1710) {
    if (il >= 1700) raids.push('ACT3_HARD');
    else if (il >= 1680) raids.push('ACT3_NORMAL');

    if (il >= 1690) raids.push('ACT2_HARD');
    else if (il >= 1670) raids.push('ACT2_NORMAL');

    if (il >= 1680) raids.push('ACT1_HARD');
  }

  // ✅ [수정된 부분] 지평의 성당 제외, 일반 레이드 상위 3개만 남기기
  const horizonRaids = raids.filter(r => r.startsWith('HORIZON_'));
  const normalRaids = raids.filter(r => !r.startsWith('HORIZON_'));

  return [...horizonRaids, ...normalRaids.slice(0, 3)];
}

interface RaidBucket {
  raidId: RaidId;
  characters: Character[];
}

// ==========================================
// ✅ 통계 유틸
// ==========================================
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

// ==========================================
// ✅ 직업 중복 규칙
// - 세르카(4인): 같은 직업 DPS 최대 1명
// - 그 외(8인): 같은 직업 DPS 최대 2명
// ==========================================
function getMaxSameJobDpsInRun(raidId: RaidId): number {
  return isFourPlayerRaid(raidId) ? 1 : 2;
}

// ==========================================
// ✅ 런 유효성 검사(최적화/후처리에서 룰 깨짐 방지)
// ==========================================
function isRunValid(
  raidId: RaidId,
  members: Character[],
  maxPerRun: number,
  maxSupportsPerRun: number,
): boolean {
  if (members.length === 0) return true;

  const supports = members.filter((m) => m.role === 'SUPPORT').length;
  if (supports > maxSupportsPerRun) return false;

  const cap = Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supports));
  if (members.length > cap) return false;

  // 같은 유저 중복 금지
  const names = new Set<string>();
  for (const m of members) {
    if (names.has(m.discordName)) return false;
    names.add(m.discordName);
  }

  // DPS 직업 중복 상한(런 단위)
  const maxSame = getMaxSameJobDpsInRun(raidId);
  const jobCount: Record<string, number> = {};
  for (const m of members) {
    if (m.role !== 'DPS') continue;
    jobCount[m.jobCode] = (jobCount[m.jobCode] || 0) + 1;
    if (jobCount[m.jobCode] > maxSame) return false;
  }

  return true;
}

// ==========================================
// ✅ [랏폿 체크 ON] 발키리 승격(보조)
// ==========================================
function promoteValkyToSupportIfNeeded(
  raidId: RaidId,
  characters: Character[],
  fillTwoSupports: boolean,
): Character[] {
  const cfg = getRaidConfig(raidId, fillTwoSupports);

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

  const runCount = estimateRunCount(raidId, characters, fillTwoSupports);
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
// ✅ add 가능 판단 (Greedy/LocalSearch 공통 규칙)
// - 유저 중복 금지
// - 서폿 상한
// - 직업 중복 상한
// - "서폿 수 기반 런 cap" 강제
// ==========================================
function canAddToRunGreedy(
  raidId: RaidId,
  runMembers: Character[],
  runPlayerCounts: Record<string, number>,
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  if (runPlayerCounts[ch.discordName]) return false;

  const supNow = runMembers.filter((m) => m.role === 'SUPPORT').length;
  const supAfter = supNow + (ch.role === 'SUPPORT' ? 1 : 0);
  if (supAfter > maxSupportsPerRun) return false;

  const cap = Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supAfter));
  if (runMembers.length + 1 > cap) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;

    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);
    if (sameJob >= maxSameJobDps) return false;
  }

  return true;
}

function canAddToRunLocalSearch(
  raidId: RaidId,
  runMembers: Character[],
  ch: Character,
  maxPerRun: number,
  maxSupportsPerRun: number,
): boolean {
  if (runMembers.length >= maxPerRun) return false;
  if (runMembers.some((m) => m.discordName === ch.discordName)) return false;

  const supNow = runMembers.filter((m) => m.role === 'SUPPORT').length;
  const supAfter = supNow + (ch.role === 'SUPPORT' ? 1 : 0);
  if (supAfter > maxSupportsPerRun) return false;

  const cap = Math.min(maxPerRun, getRunSizeCapBySupports(raidId, supAfter));
  if (runMembers.length + 1 > cap) return false;

  if (ch.role === 'DPS') {
    const sameJob = runMembers.filter(
      (m) => m.role === 'DPS' && m.jobCode === ch.jobCode,
    ).length;

    const maxSameJobDps = getMaxSameJobDpsInRun(raidId);
    if (sameJob >= maxSameJobDps) return false;
  }

  return true;
}

// ==========================================
// ✅ [랏폿 체크 ON] 2서폿 런 우선 생성 보정(pack)
// - 1서폿 런 두 개가 있으면 한쪽 서폿을 다른 쪽으로 옮겨 2서폿 런 만들기 시도
// ==========================================
function packSupportsToTwoPerRunIfPossible(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  fillTwoSupports: boolean,
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

    const oneSupRuns = runs
      .map((r, idx) => ({ idx, r, s: supCount(r) }))
      .filter((x) => x.s === 1 && x.r.length > 0);

    if (oneSupRuns.length < 2) break;

    // receiver: 더 큰 런 우선(완성시키기)
    oneSupRuns.sort((a, b) => b.r.length - a.r.length);
    const receiverIdx = oneSupRuns[0].idx;

    let donorIdx = -1;

    for (let k = oneSupRuns.length - 1; k >= 1; k--) {
      const cand = oneSupRuns[k];
      const donor = cand.r;

      const sup = donor.find((m) => m.role === 'SUPPORT');
      if (!sup) continue;

      if (hasUser(runs[receiverIdx], sup.discordName)) continue;

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

// ==========================================
// ✅ "한 번에 최대한 많이" Front-load 극대화(요청 핵심)
// - 랏폿 ON이면: 2서폿 런을 앞 런부터 최대한 먼저 만들고(가능하면)
// - 그 다음: 뒤 런에서 앞으로 사람을 끌어와서 앞 런을 cap까지 채움
// ==========================================
function maximizeRunsFrontloaded(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  fillTwoSupports: boolean,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);

  const supCount = (run: Character[]) => run.filter((m) => m.role === 'SUPPORT').length;
  const buildPlayerSet = (run: Character[]) => new Set(run.map((m) => m.discordName));

  const runCap = (run: Character[]) => {
    const capBySup = getRunSizeCapBySupports(raidId, supCount(run));
    return Math.min(maxPerRun, capBySup);
  };

  const donorValidAfterRemoval = (donor: Character[], removeId: string) => {
    const next = donor.filter((m) => m.id !== removeId);
    return isRunValid(raidId, next, maxPerRun, maxSupportsPerRun);
  };

  // 1) 랏폿 ON이면 앞 런부터 2서폿 확보(가능하면)
  if (fillTwoSupports && !isFourPlayerRaid(raidId)) {
    for (let i = 0; i < runs.length; i++) {
      while (supCount(runs[i]) < 2) {
        let moved = false;

        for (let j = runs.length - 1; j > i; j--) {
          const donor = runs[j];
          const supIdx = donor.findIndex((m) => m.role === 'SUPPORT');
          if (supIdx === -1) continue;

          const sup = donor[supIdx];
          const playersI = buildPlayerSet(runs[i]);
          if (playersI.has(sup.discordName)) continue;

          if (!canAddToRunLocalSearch(raidId, runs[i], sup, maxPerRun, maxSupportsPerRun)) continue;
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

  // 2) 앞 런부터 cap까지 채우기(뒤 -> 앞 이동)
  for (let i = 0; i < runs.length; i++) {
    let capI = runCap(runs[i]);

    while (runs[i].length < capI) {
      let moved = false;
      const playersI = buildPlayerSet(runs[i]);

      for (let j = runs.length - 1; j > i; j--) {
        if (runs[j].length === 0) continue;

        const wantSupport =
          fillTwoSupports && !isFourPlayerRaid(raidId) && supCount(runs[i]) < 2;

        const candidates = [...runs[j]].sort((a, b) => {
          if (wantSupport && a.role !== b.role) return a.role === 'SUPPORT' ? -1 : 1;
          return b.combatPower - a.combatPower || a.id.localeCompare(b.id);
        });

        for (const ch of candidates) {
          if (playersI.has(ch.discordName)) continue;

          if (!canAddToRunLocalSearch(raidId, runs[i], ch, maxPerRun, maxSupportsPerRun)) continue;
          if (!donorValidAfterRemoval(runs[j], ch.id)) continue;

          runs[j] = runs[j].filter((m) => m.id !== ch.id);
          runs[i].push(ch);

          moved = true;
          break;
        }

        if (moved) break;
      }

      if (!moved) break;

      // 서폿 이동으로 cap이 증가할 수 있음(0->6,1->7,2->8)
      capI = runCap(runs[i]);
    }
  }

  return runs.filter((r) => r.length > 0);
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

    if (!canAddToRunLocalSearch(raidId, toRun, ch, maxPerRun, maxSupportsPerRun)) continue;

    const idxInFrom = fromRun.findIndex((m) => m.id === ch.id);
    if (idxInFrom === -1) continue;

    fromRun.splice(idxInFrom, 1);
    toRun.push(ch);

    if (
      !isRunValid(raidId, fromRun, maxPerRun, maxSupportsPerRun) ||
      !isRunValid(raidId, toRun, maxPerRun, maxSupportsPerRun)
    ) {
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

/**
 * ⚡️ [Speed Mode] 인원 수 유지(Swap Only) 최적화
 */
function optimizeCombatPowerBySwapOnly(
  raidId: RaidId,
  runsMembers: Character[][],
  maxSupportsPerRun: number,
  maxPerRun: number,
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
      if (toRun.some((m) => m.id !== cTo.id && m.discordName === cFrom.discordName)) return false;

      if (cFrom.role === 'DPS') {
        const sameJobCount = toRun.filter(
          (m) => m.id !== cTo.id && m.role === 'DPS' && m.jobCode === cFrom.jobCode,
        ).length;
        if (sameJobCount >= maxSameJobDps) return false;
      } else {
        const supCount = toRun.filter((m) => m.id !== cTo.id && m.role === 'SUPPORT').length;
        if (supCount >= maxSupportsPerRun) return false;
      }
      return true;
    };

    if (!canSwap(runs[r2], char1, char2)) continue;
    if (!canSwap(runs[r1], char2, char1)) continue;

    runs[r1][c1Idx] = char2;
    runs[r2][c2Idx] = char1;

    if (
      !isRunValid(raidId, runs[r1], maxPerRun, maxSupportsPerRun) ||
      !isRunValid(raidId, runs[r2], maxPerRun, maxSupportsPerRun)
    ) {
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

/**
 * ✅ speed 모드에서 "앞 런부터 최대한 꽉 채우기" 압축(기존)
 */
function compactRunsFrontloadedForSpeed(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
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
          if (!canAddToRunGreedy(raidId, runs[i], countsI, ch, maxPerRun, maxSupportsPerRun)) continue;

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
        if (!canAddToRunGreedy(raidId, targetRun, targetCounts, ch, maxPerRun, maxSupportsPerRun)) continue;

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

function swapSameUserCharactersToFixDuplicates(
  raidId: RaidId,
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
): Character[][] {
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

// ==========================================
// ✅ 레이드별 버킷
// ==========================================
function groupCharactersByRaid(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
): RaidBucket[] {
  const map: Record<RaidId, Character[]> = {
    ACT1_HARD: [], // 🌟 추가
    ACT2_NORMAL: [], // 🌟 추가
    ACT3_NORMAL: [], // 🌟 추가
    ACT2_HARD: [], // 🌟 추가
    ACT3_HARD: [], // 🌟 추가
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
    HORIZON_STEP1: [], 
    HORIZON_STEP2: [], 
    HORIZON_STEP3: [],
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

// ==========================================
// ✅ 런 구성 (핵심)
// - 랏폿 ON이면: 2서폿 런을 우선 생성/유지
// - 최우선 목표: "앞 런부터 최대 인원"(7,6,5...) => maximizeRunsFrontloaded 적용
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

  const runsMembers: Character[][] = Array.from({ length: runCount }, () => [] as Character[]);
  const runsTotalPower: number[] = Array(runCount).fill(0);
  const runsDpsPower: number[] = Array(runCount).fill(0);
  const runsSupPower: number[] = Array(runCount).fill(0);
  const runsPlayerCounts: Array<Record<string, number>> = Array.from({ length: runCount }, () => ({}));

  const maxSameJobDps = getMaxSameJobDpsInRun(raidId);

  const supports = characters
    .filter((c) => !lockIds.has(c.id) && c.role === 'SUPPORT')
    .slice()
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  const dps = characters
    .filter((c) => !lockIds.has(c.id) && c.role === 'DPS')
    .slice()
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  const targetSupPerRun = isFourPlayerRaid(raidId) ? 1 : (fillTwoSupports ? 2 : 1);

  const placeIntoRun = (runIdx: number, ch: Character) => {
    runsMembers[runIdx].push(ch);
    runsTotalPower[runIdx] += ch.combatPower;
    if (ch.role === 'DPS') runsDpsPower[runIdx] += ch.combatPower;
    else runsSupPower[runIdx] += ch.combatPower;
    runsPlayerCounts[runIdx][ch.discordName] = (runsPlayerCounts[runIdx][ch.discordName] || 0) + 1;
  };

  // 1) 서폿 먼저: 랏폿 ON이면 2서폿 런 우선
  for (const sup of supports) {
    let best = -1;

    // (a) 목표치 미만 런 우선(0->1->2)
    let bestScore: [number, number, number] | null = null; // [supCnt, -size, idx]
    for (let i = 0; i < runsMembers.length; i++) {
      const run = runsMembers[i];
      const supCnt = run.filter((m) => m.role === 'SUPPORT').length;

      if (supCnt >= targetSupPerRun) continue;
      if (!canAddToRunGreedy(raidId, run, runsPlayerCounts[i], sup, maxPerRun, maxSupportsPerRun)) continue;

      const score: [number, number, number] = [supCnt, -run.length, i];
      if (
        !bestScore ||
        score[0] < bestScore[0] ||
        (score[0] === bestScore[0] && score[1] < bestScore[1])
      ) {
        bestScore = score;
        best = i;
      }
    }

    // (b) 그래도 없으면 size 큰 런 우선
    if (best === -1) {
      let bestSize = -1;
      for (let i = 0; i < runsMembers.length; i++) {
        const run = runsMembers[i];
        if (!canAddToRunGreedy(raidId, run, runsPlayerCounts[i], sup, maxPerRun, maxSupportsPerRun)) continue;
        if (run.length > bestSize) {
          bestSize = run.length;
          best = i;
        }
      }
    }

    // (c) 새 런 생성(미배치 0)
    if (best === -1) {
      best = runsMembers.length;
      runsMembers.push([]);
      runsTotalPower.push(0);
      runsDpsPower.push(0);
      runsSupPower.push(0);
      runsPlayerCounts.push({});
    }

    placeIntoRun(best, sup);
  }

  // 2) DPS 배치
  for (const ch of dps) {
    let bestIndex = -1;
    const currentRunCount = runsMembers.length;

    if (speed) {
      // speed: (랏폿 ON이면) supports 많은 런 우선(2 > 1 > 0), 그 다음 size 큰 런 우선
      let bestTuple: [number, number, number] | null = null; // [supCnt, size, idx]
      for (let i = 0; i < currentRunCount; i++) {
        const run = runsMembers[i];
        if (!canAddToRunGreedy(raidId, run, runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun)) continue;

        const supCnt = run.filter((m) => m.role === 'SUPPORT').length;
        const size = run.length;
        const tuple: [number, number, number] = [supCnt, size, i];

        if (!bestTuple) bestTuple = tuple;
        else {
          if (tuple[0] > bestTuple[0]) bestTuple = tuple;
          else if (tuple[0] === bestTuple[0] && tuple[1] > bestTuple[1]) bestTuple = tuple;
        }
      }
      if (bestTuple) bestIndex = bestTuple[2];
    } else {
      // balance: power 낮은 런 우선 + (랏폿 ON이면) supports 높은 런 약간 선호
      let bestScore: [number, number, number, number] | null = null; // [metric, -supBoost, size, idx]
      for (let i = 0; i < currentRunCount; i++) {
        const run = runsMembers[i];
        if (!canAddToRunGreedy(raidId, run, runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun)) continue;

        const metric = dim === 'overall' ? runsTotalPower[i] : runsDpsPower[i];
        const supCnt = run.filter((m) => m.role === 'SUPPORT').length;
        const supBoost = fillTwoSupports && !isFourPlayerRaid(raidId) ? supCnt : 0;

        const score: [number, number, number, number] = [metric, -supBoost, run.length, i];

        if (
          !bestScore ||
          score[0] < bestScore[0] ||
          (score[0] === bestScore[0] && score[1] < bestScore[1])
        ) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    // fallback: 그냥 들어갈 수 있는 곳 중 size 큰 곳
    if (bestIndex === -1) {
      let bestSize = -1;
      for (let i = 0; i < currentRunCount; i++) {
        const run = runsMembers[i];
        const size = run.length;
        if (size >= maxPerRun) continue;
        if (runsPlayerCounts[i][ch.discordName]) continue;

        const sameJob = run.filter((m) => m.role === 'DPS' && m.jobCode === ch.jobCode).length;
        if (sameJob >= maxSameJobDps) continue;

        if (!canAddToRunGreedy(raidId, run, runsPlayerCounts[i], ch, maxPerRun, maxSupportsPerRun)) continue;

        if (size > bestSize) {
          bestSize = size;
          bestIndex = i;
        }
      }
    }

    // 새 런 생성(미배치 0)
    if (bestIndex === -1) {
      bestIndex = runsMembers.length;
      runsMembers.push([]);
      runsTotalPower.push(0);
      runsDpsPower.push(0);
      runsSupPower.push(0);
      runsPlayerCounts.push({});
    }

    placeIntoRun(bestIndex, ch);
  }

  // ✅ 2서폿 런 우선 압축 + "앞 런 최대" 1차
  let stage1 = packSupportsToTwoPerRunIfPossible(
    raidId,
    runsMembers,
    maxPerRun,
    maxSupportsPerRun,
    fillTwoSupports,
  );

  stage1 = maximizeRunsFrontloaded(
    raidId,
    stage1,
    maxPerRun,
    maxSupportsPerRun,
    fillTwoSupports,
  );

  // ✅ 최적화
  let optimized: Character[][];
  if (speed) {
    optimized = optimizeCombatPowerBySwapOnly(
      raidId,
      stage1,
      maxSupportsPerRun,
      maxPerRun,
      dim,
      random,
      lockIds,
    );

    optimized = compactRunsFrontloadedForSpeed(
      raidId,
      optimized,
      maxPerRun,
      maxSupportsPerRun,
    );
  } else {
    optimized = optimizeRunsByStdDev(
      raidId,
      stage1,
      maxPerRun,
      maxSupportsPerRun,
      dim,
      random,
      lockIds,
    );
  }

  optimized = minimizeSameJobInRuns(raidId, optimized, maxPerRun, maxSupportsPerRun);
  optimized = swapSameUserCharactersToFixDuplicates(raidId, optimized, maxPerRun, maxSupportsPerRun);

  // ✅ 2서폿/앞런최대 최종 보정
  optimized = packSupportsToTwoPerRunIfPossible(
    raidId,
    optimized,
    maxPerRun,
    maxSupportsPerRun,
    fillTwoSupports,
  );

  optimized = maximizeRunsFrontloaded(
    raidId,
    optimized,
    maxPerRun,
    maxSupportsPerRun,
    fillTwoSupports,
  );

  // ✅ RaidRun 변환
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

  return rebalanceSupportsGlobal(runs);
}

// ==========================================
// ✅ 파티 나누기(룰 반영)
// - 세르카: 1파티(최대 4). 단, 런 단계에서 서폿0이면 3 cap이라 여기까지 4가 안 들어옴
// - 세르카 제외:
//   - 서폿 있는 파티: 최대 4
//   - 서폿 없는 파티: 최대 3
// => 결과: (0서폿 런: 3+3), (1서폿 런: 4+3), (2서폿 런: 4+4)
// ==========================================
function splitIntoPartiesLossless(members: Character[], raidId: RaidId): RaidRunParty[] {
  const maxParties = isFourPlayerRaid(raidId) ? 1 : 2;

  const supports = [...members]
    .filter((m) => m.role === 'SUPPORT')
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  const dps = [...members]
    .filter((m) => m.role === 'DPS')
    .sort((a, b) => b.combatPower - a.combatPower || a.id.localeCompare(b.id));

  // ✅ 파티 수 결정(수정): "4명 + 서폿0"이면 2파티로 쪼개서 인원 증발 방지
  let partyCount = 1;
  if (!isFourPlayerRaid(raidId)) {
    const noSupportRun = supports.length === 0;

    if (members.length > 4) {
      partyCount = 2;
    } else if (members.length === 4 && noSupportRun) {
      partyCount = 2; // 3 cap(서폿0) 때문에 1파티로는 4명 수용 불가 → 2파티 필요
    } else {
      partyCount = 1;
    }
  }
  partyCount = Math.min(maxParties, partyCount);

  const parties: FixedRaidRunParty[] = Array.from({ length: partyCount }, (_, idx) => ({
    partyIndex: idx + 1,
    members: [],
  }));

  const usedIds = new Set<string>();

  const maxSize = (party: FixedRaidRunParty) => {
    if (isFourPlayerRaid(raidId)) return 4;
    const hasSup = party.members.some((m) => m.role === 'SUPPORT');
    return hasSup ? 4 : 3;
  };

  const addMember = (party: FixedRaidRunParty, c: Character) => {
    if (party.members.length >= maxSize(party)) return false;
    party.members.push(c);
    usedIds.add(c.id);
    return true;
  };

  // 1) 서폿 우선 배치(파티당 1명까지)
  for (let i = 0; i < parties.length; i++) {
    const sup = supports.find((s) => !usedIds.has(s.id));
    if (sup) addMember(parties[i], sup);
  }

  // 2) DPS 배치 (Snake, 파티 내 동일 직업 DPS 중복 최소화)
  let placed = true;
  while (placed) {
    placed = false;

    for (let i = 0; i < parties.length; i++) {
      const p = parties[i];
      if (p.members.length >= maxSize(p)) continue;

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
    for (let i = parties.length - 1; i >= 0; i--) {
      const p = parties[i];
      if (p.members.length >= maxSize(p)) continue;

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

  // 3) 남은 인원 강제 배치(파티 cap 적용)
  [...supports, ...dps].forEach((c) => {
    if (!usedIds.has(c.id)) {
      for (const p of parties) {
        if (addMember(p, c)) break;
      }
    }
  });

  return parties.filter((p) => p.members.length > 0) as unknown as RaidRunParty[];
}

// ==========================================
// ✅ 글로벌 서폿 재분배(기존 로직 유지)
// ==========================================
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

    // 서폿0인데 파티가 비지 않음 -> lacking
    if (supports === 0 && size > 0) lacking.push(entry);

    // "서폿1 혼자" 파티 -> donors
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
      // 낮은 런에 더 높은 런의 서폿 붙여주기
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
      // 높은 런에 너무 높은 서폿 붙이면 더 치우칠 수 있으니 낮은쪽 donor 선호
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
// ==============================
function cloneSchedule(schedule: RaidSchedule): RaidSchedule {
  const result: RaidSchedule = {
    ACT1_HARD: [], // 🌟 추가
    ACT2_NORMAL: [], // 🌟 추가
    ACT3_NORMAL: [], // 🌟 추가
    ACT2_HARD: [], // 🌟 추가
    ACT3_HARD: [], // 🌟 추가
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
    HORIZON_STEP1: [], 
    HORIZON_STEP2: [], 
    HORIZON_STEP3: [],
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
 * ✅ [최종] 세르카 구성 강제
 * - swaps/exclusions 이후에도 "서폿0 + 4명"이 생기면 안 됨(세르카 서폿0 cap=3)
 * - 서폿 있는 런(4인)으로 1명 이동
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

      const srcIdx = runs.findIndex((_, idx) => {
        const mem = getRunMembers(idx);
        return mem.length === 4 && supCount(mem) === 0;
      });
      if (srcIdx === -1) break;

      const srcMembers = getRunMembers(srcIdx);

      const mover = [...srcMembers]
        .filter((m) => m.role === 'DPS')
        .sort((a, b) => a.combatPower - b.combatPower || a.id.localeCompare(b.id))[0];

      if (!mover) break;

      let bestDstIdx = -1;
      let bestSize = -1;

      for (let di = 0; di < runs.length; di++) {
        if (di === srcIdx) continue;

        const dstMembers = getRunMembers(di);
        if (dstMembers.length >= 4) continue;
        if (supCount(dstMembers) <= 0) continue;
        if (hasUser(dstMembers, mover.discordName)) continue;

        // 세르카: 같은 직업 DPS 중복 금지(파티 4인)
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
): RaidSchedule {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered, exclusions);

  const SEED = 123456789;
  const seededRng = createSeededRandom(SEED);

  const schedule: RaidSchedule = {
    ACT1_HARD: [], // 🌟 추가
    ACT2_NORMAL: [], // 🌟 추가
    ACT3_NORMAL: [], // 🌟 추가
    ACT2_HARD: [], // 🌟 추가
    ACT3_HARD: [], // 🌟 추가
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
    HORIZON_STEP1: [], 
    HORIZON_STEP2: [], 
    HORIZON_STEP3: [],
  };

  buckets.forEach(({ raidId, characters }) => {
    if (raidId === 'ACT1_HARD' || raidId === 'ACT2_NORMAL' || raidId === 'ACT2_HARD' || raidId === 'ACT3_NORMAL' || raidId === 'ACT3_HARD') return;
    const fillTwoSupports = Boolean(raidSettings?.[raidId]); // ✅ 랏폿 체크

    // ✅ 랏폿 체크 ON이면 승격을 통해 2서폿 런 우선 생성이 쉬워짐
    const pool = fillTwoSupports
      ? promoteValkyToSupportIfNeeded(raidId, characters, fillTwoSupports)
      : characters;

    if (schedule[raidId] !== undefined) {
      schedule[raidId] = distributeCharactersIntoRuns(
        raidId,
        pool,
        balanceMode,
        seededRng,
        fillTwoSupports,
      );
    }
  });

  // ✅ immutable pipeline
  const scheduleWithSwaps = applySwaps(schedule, swaps, characters);
  const scheduleWithExclusions = enforceExclusions(scheduleWithSwaps, exclusions);

  // ✅ 세르카 안전장치
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
  const filtered = characters.filter((c) => c.itemLevel >= 1680);

  const map: Record<RaidId, Character[]> = {
    ACT1_HARD: [], // 🌟 추가
    ACT2_NORMAL: [], // 🌟 추가
    ACT3_NORMAL: [], // 🌟 추가
    ACT2_HARD: [], // 🌟 추가
    ACT3_HARD: [], // 🌟 추가
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    SERKA_NORMAL: [],
    SERKA_HARD: [],
    SERKA_NIGHTMARE: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
    HORIZON_STEP1: [], 
    HORIZON_STEP2: [], 
    HORIZON_STEP3: [],
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
