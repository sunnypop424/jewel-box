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

/**
 * 🛠 1순위: 실질 최대 인원 (Discord 유저 수 기준)
 * 참여하는 고유 Discord 유저 수가 게임 슬롯보다 적으면, 그 유저 수가 곧 '만석' 기준이 됨.
 */
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
 * 🧹 마지막 공대에 같은 직업 DPS가 남아 있으면
 *    앞 공대로 옮길 수 있는 만큼 옮겨서,
 *    마지막 공대 직업 구성을 최대한 다양하게 만든다.
 */
function minimizeSameJobInLastRun(
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  // 1️⃣ 마지막 "비어 있지 않은" 공대 인덱스 찾기
  let lastIdx = -1;
  for (let i = runCount - 1; i >= 0; i--) {
    if (runs[i].length > 0) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx <= 0) return runs;

  const lastRun = runs[lastIdx];

  // 2️⃣ 마지막 공대에서 DPS 직업별 인원 수 세기
  const jobCounts: Record<string, number> = {};
  lastRun.forEach((c) => {
    if (c.role !== 'DPS') return;
    jobCounts[c.jobCode] = (jobCounts[c.jobCode] || 0) + 1;
  });

  // 2명 이상 있는 직업들만 신경쓴다
  const duplicatedJobCodes = Object.keys(jobCounts).filter(
    (job) => jobCounts[job] >= 2,
  );
  if (duplicatedJobCodes.length === 0) return runs;

  const buildPlayerCounts = (members: Character[]) => {
    const counts: Record<string, number> = {};
    members.forEach((m) => {
      counts[m.discordName] = (counts[m.discordName] || 0) + 1;
    });
    return counts;
  };

  // 3️⃣ 마지막 공대의 "중복 직업 DPS"들을 앞 공대로 한 명씩 밀어보기
  for (const ch of [...lastRun]) {
    if (ch.role !== 'DPS') continue;
    if (!duplicatedJobCodes.includes(ch.jobCode)) continue;

    // 앞 공대 0 ~ lastIdx-1까지 순회
    for (let ri = 0; ri < lastIdx; ri++) {
      const targetRun = runs[ri];
      const targetCounts = buildPlayerCounts(targetRun);

      // canAddToRunGreedy 조건(인원 제한, 1인1캐릭, 직업2중복, 서폿제한) 안 깨면 이동
      if (!canAddToRunGreedy(targetRun, targetCounts, ch, maxPerRun, maxSupportsPerRun)) {
        continue;
      }

      const idxInLast = lastRun.findIndex((m) => m.id === ch.id);
      if (idxInLast === -1) break;

      // 실제 이동
      lastRun.splice(idxInLast, 1);
      targetRun.push(ch);

      // 다음 중복 DPS로 진행
      break;
    }
  }

  return runs;
}

/**
 * 🧍 마지막 공대에 혼자 남는 경우,
 *    그 유저가 가진 캐릭터들 중에서
 *    "다른 공대 평균 전투력보다 높은 캐릭터"들 중
 *    가장 낮은 전투력의 캐릭터가 혼자 가도록 스왑한다.
 */
function adjustSoloLastRunStrongCharacter(
  runsMembers: Character[][],
  maxPerRun: number,
  maxSupportsPerRun: number,
  lockIds: Set<string>,
): Character[][] {
  const runs = runsMembers.map((r) => [...r]);
  const runCount = runs.length;
  if (runCount <= 1) return runs;

  // 1️⃣ 마지막 "비어 있지 않은" 공대 찾기
  let lastIdx = -1;
  for (let i = runCount - 1; i >= 0; i--) {
    if (runs[i].length > 0) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx <= 0) return runs;

  const lastRun = runs[lastIdx];
  if (lastRun.length !== 1) return runs; // 혼자 있는 공대가 아니면 패스

  const solo = lastRun[0];
  if (lockIds.has(solo.id)) return runs; // 고정 멤버면 건드리지 않음

  // 2️⃣ 나머지 공대들의 평균 전투력 계산
  const otherAverages: number[] = [];
  for (let i = 0; i < runCount; i++) {
    if (i === lastIdx) continue;
    const members = runs[i];
    if (members.length === 0) continue;
    const avg =
      members.reduce((sum, c) => sum + c.combatPower, 0) / members.length;
    otherAverages.push(avg);
  }
  if (otherAverages.length === 0) return runs;

  const threshold = Math.max(...otherAverages);

  // 3️⃣ 이 유저가 가진 캐릭터들 중에서 기준 이상인 후보 찾기
  type Candidate = { runIndex: number; charIndex: number; ch: Character };

  const candidates: Candidate[] = [];

  for (let ri = 0; ri < runCount; ri++) {
    const members = runs[ri];
    for (let ci = 0; ci < members.length; ci++) {
      const ch = members[ci];
      if (lockIds.has(ch.id)) continue;
      if (ch.discordName !== solo.discordName) continue;
      if (ch.combatPower >= threshold) {
        candidates.push({ runIndex: ri, charIndex: ci, ch });
      }
    }
  }

  if (candidates.length === 0) {
    // 기준 이상인 캐릭터가 없으면 그냥 현 상태 유지
    return runs;
  }

  // 전투력이 낮은 순으로 정렬 (기준 이상 중에서 가장 낮은 캐릭터를 우선 시도)
  candidates.sort((a, b) => a.ch.combatPower - b.ch.combatPower);

  const buildPlayerCounts = (members: Character[]) => {
    const counts: Record<string, number> = {};
    members.forEach((m) => {
      counts[m.discordName] = (counts[m.discordName] || 0) + 1;
    });
    return counts;
  };

  // 4️⃣ 각 후보에 대해 "솔로 자리에 보내고, 기존 솔로는 그 공대로 보내는" 스왑 시도
  for (const cand of candidates) {
    const { runIndex: ri, charIndex: ci } = cand;

    if (ri === lastIdx && ci === 0) {
      // 이미 마지막 공대에 그 캐릭터가 혼자 있다면 더 할게 없음
      return runs;
    }

    const lastRunMembers = runs[lastIdx];
    const targetRunMembers = runs[ri];

    const originalSolo = solo;

    // 임시로 빼기
    const [removedCandidate] = targetRunMembers.splice(ci, 1);
    lastRunMembers.pop(); // 기존 솔로 제거

    // 마지막 공대에 후보를 넣을 수 있는지 확인
    const lastCounts = buildPlayerCounts(lastRunMembers);
    const canPlaceCandidateInLast = canAddToRunGreedy(
      lastRunMembers,
      lastCounts,
      removedCandidate,
      maxPerRun,
      maxSupportsPerRun,
    );

    // 후보를 넣고 난 뒤, 기존 솔로를 target 공대로 넣을 수 있는지 확인
    const targetCounts = buildPlayerCounts(targetRunMembers);
    const canPlaceSoloInTarget = canAddToRunGreedy(
      targetRunMembers,
      targetCounts,
      originalSolo,
      maxPerRun,
      maxSupportsPerRun,
    );

    if (canPlaceCandidateInLast && canPlaceSoloInTarget) {
      // 실제 스왑 수행
      lastRunMembers.push(removedCandidate);
      targetRunMembers.push(originalSolo);
      return runs;
    }

    // 실패하면 되돌리기
    lastRunMembers.push(originalSolo);
    targetRunMembers.splice(ci, 0, removedCandidate);
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
  // 게임 슬롯 기준 최대 인원
  const maxSupportsPerRun = cfg.maxSupportsPerRun;

  // ✅ 디스코드 유저 수 기준 실질 최대 인원
  const maxPerRun = getEffectiveMaxPerRun(raidId, characters);

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

  // 🔹 랏폿이 아닐 때만 "쎈 딜러 선배치 모드" 사용
  const strongDpsIds = new Set<string>();

  if (!isSupportShortage) {
    // 1단계: "쎈 딜러"를 공대당 1명 정도 먼저 박아두기
    // - 기준: 전투력 내림차순 상위 runCount명의 DPS
    const dpsCandidates = sorted.filter((c) => c.role === 'DPS');
    const strongCount = Math.min(runCount, dpsCandidates.length);

    for (let k = 0; k < strongCount; k++) {
      const ch = dpsCandidates[k];

      let bestRun = -1;
      let bestMetric = Infinity;

      // 현재까지의 공대별 DPS 합을 보고, 가장 약한 쪽부터 채움
      for (let i = 0; i < runCount; i++) {
        if (
          !canAddToRunGreedy(
            runsMembers[i],
            runsPlayerCounts[i],
            ch,
            maxPerRun,
            maxSupportsPerRun,
          )
        ) {
          continue;
        }

        const metric = runsDpsPower[i]; // 해당 공대의 현재 딜러 전투력 합

        if (metric < bestMetric) {
          bestMetric = metric;
          bestRun = i;
        }
      }

      // 들어갈 수 있는 공대가 없다면 스킵
      if (bestRun === -1) continue;

      runsMembers[bestRun].push(ch);
      runsTotalPower[bestRun] += ch.combatPower;
      runsDpsPower[bestRun] += ch.combatPower;
      runsPlayerCounts[bestRun][ch.discordName] =
        (runsPlayerCounts[bestRun][ch.discordName] || 0) + 1;

      strongDpsIds.add(ch.id);
    }

    // 강한 딜러로 미리 배치한 애들은 sorted에서 제거
    sorted = sorted.filter((c) => !strongDpsIds.has(c.id));
  }

  // 🔹 나머지 인원 배치 (⚠ 한 번만!)
  sorted.forEach((ch) => {
    let bestIndex = -1;
    let bestScore: [number, number, number] | null = null;

    // 1️⃣ 먼저 기존 규칙(canAddToRunGreedy) 기준으로 최선의 런 찾기
    for (let i = 0; i < runCount; i++) {
      if (
        !canAddToRunGreedy(
          runsMembers[i],
          runsPlayerCounts[i],
          ch,
          maxPerRun,
          maxSupportsPerRun,
        )
      ) {
        continue;
      }

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

    // 2️⃣ 어떤 런에도 strict 규칙으로는 못 들어가면 → 완화된 fallback 시도
    if (bestIndex === -1) {
      let fallbackIndex = -1;
      let minSize = Infinity;

      for (let i = 0; i < runCount; i++) {
        const size = runsMembers[i].length;
        if (size >= maxPerRun) continue; // 슬롯 꽉 찬 런은 패스

        // 같은 디코 닉네임은 여전히 금지
        const alreadyInRun = runsPlayerCounts[i][ch.discordName] || 0;
        if (alreadyInRun > 0) continue;

        if (ch.role === 'SUPPORT') {
          const supCount = runsMembers[i].filter(
            (m) => m.role === 'SUPPORT',
          ).length;
          // 서폿 하드 제한은 그대로 지킴
          if (supCount >= maxSupportsPerRun) continue;
          // 👉 "4인 이전 2서폿 금지" 같은 soft 규칙은 여기선 무시
        }

        // DPS는 직업 2중복 규칙도 여기선 무시 (인원 누락 방지가 우선)
        if (size < minSize) {
          minSize = size;
          fallbackIndex = i;
        }
      }

      if (fallbackIndex !== -1) {
        bestIndex = fallbackIndex;
      }
    }

    // 3️⃣ 진짜로 어디에도 못 들어간 극단 케이스만 로그 남기고 스킵
    if (bestIndex === -1) {
      console.warn(
        '[RaidSchedule] no available run for',
        raidId,
        ch.discordName,
        ch.jobCode,
      );
      return;
    }

    // 최종 배치
    runsMembers[bestIndex].push(ch);
    runsTotalPower[bestIndex] += ch.combatPower;
    if (ch.role === 'DPS') runsDpsPower[bestIndex] += ch.combatPower;
    else runsSupPower[bestIndex] += ch.combatPower;

    runsPlayerCounts[bestIndex][ch.discordName] =
      (runsPlayerCounts[bestIndex][ch.discordName] || 0) + 1;
  });



  const optimizedRunsMembersRaw = speed
    ? optimizeRunsForSpeed(
      runsMembers,
      maxPerRun,
      maxSupportsPerRun,
      lockIds,
      isSupportShortage,
    )
    : optimizeRunsByStdDev(
      runsMembers,
      maxPerRun,
      maxSupportsPerRun,
      dim,
      random,
      lockIds,
    );

  // ✅ 1단계: 마지막 공대에서 같은 직업 DPS 최소화
  const afterJobAdjust = minimizeSameJobInLastRun(
    optimizedRunsMembersRaw,
    maxPerRun,
    maxSupportsPerRun,
  );

  // ✅ 2단계: 마지막 공대가 혼자 남는 경우, 가장 적절한(전투력 기준) 캐릭터를 혼자로 배치
  const optimizedRunsMembers = adjustSoloLastRunStrongCharacter(
    afterJobAdjust,
    maxPerRun,
    maxSupportsPerRun,
    lockIds,
  );

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

  console.log(
    runs.map(run =>
      run.parties.map(p => ({
        partyIndex: p.partyIndex,
        supports: p.members.filter(m => m.role === 'SUPPORT').length,
        size: p.members.length
      }))
    )
  );


  return rebalanceSupportsGlobal(runs);
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
    return parties;
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

/**
 * 🌍 레이드 전체 기준 서폿 재배치
 * - 서폿이 없는 파티(lacking)가 있으면
 * - "서폿 혼자 있는 파티(size=1, supports=1)"(donor)에서 서폿을 빼와 채운다
 * - 이때, 각 공대(run)의 평균 전투력을 고려해서
 *   약한 공대에는 상대적으로 강한 공대에서 서폿을,
 *   강한 공대에는 상대적으로 약한 공대에서 서폿을 가져와
 *   전체 공대 평균 전투력이 서로 비슷해지도록 유도한다.
 */
function rebalanceSupportsGlobal(runs: RaidRun[]): RaidRun[] {
  // 🔹 원본을 건드리지 않도록 얕은 복사
  const result = runs.map(run => ({
    ...run,
    parties: run.parties.map(p => ({ ...p, members: [...p.members] })),
  }));

  // 공대(run) 평균 전투력 계산
  const getRunAverageCombatPower = (runIndex: number): number => {
    const members = result[runIndex].parties.flatMap(p => p.members);
    if (!members.length) return 0;
    const total = members.reduce((sum, m) => sum + m.combatPower, 0);
    return total / members.length;
  };

  const computeRunAverages = (): number[] =>
    result.map((_, idx) => getRunAverageCombatPower(idx));

  // 1️⃣ 전체 파티 수집
  const allParties: Array<{
    runIndex: number;
    partyIndex: number;
    party: RaidRunParty;
  }> = [];

  result.forEach((run, ri) => {
    run.parties.forEach((p, pi) => {
      allParties.push({ runIndex: ri, partyIndex: pi, party: p });
    });
  });

  const lacking: typeof allParties = [];
  const donors: typeof allParties = [];

  for (const entry of allParties) {
    const supports = entry.party.members.filter(m => m.role === 'SUPPORT').length;
    const size = entry.party.members.length;

    // 실제 인원이 있는 파티인데 서폿이 0명인 경우 → 채워야 하는 대상
    if (supports === 0 && size > 0) {
      lacking.push(entry);
    }

    // 서폿 1명만 있고 혼자 있는 파티 → 여기서 서폿을 빼와도 파티 조건이 안 깨짐
    if (supports === 1 && size === 1) {
      donors.push(entry);
    }
  }

  // 2️⃣ 가능한 만큼 매칭
  while (lacking.length > 0 && donors.length > 0) {
    const target = lacking.shift()!;

    const runAvgs = computeRunAverages();
    const nonZeroAvgs = runAvgs.filter(v => v > 0);
    const globalMedian =
      nonZeroAvgs.length > 0 ? median(nonZeroAvgs) : 0; // 상단에 이미 정의된 median 사용

    const targetRunAvg = runAvgs[target.runIndex];

    // 🔍 이번 타겟 파티에 넣을 donor 선택 기준:
    // - targetRunAvg가 전체 중앙값보다 낮으면 → "평균 전투력이 높은 공대" 위주로
    // - targetRunAvg가 높으면 → "평균 전투력이 낮은 공대" 위주로
    let bestDonorIdx = -1;

    if (targetRunAvg <= globalMedian) {
      // 타겟 공대가 상대적으로 약함 → 더 강한 공대에서 서폿을 빼옴
      let bestAvg = -Infinity;
      donors.forEach((donor, idx) => {
        const sup = donor.party.members.find(m => m.role === 'SUPPORT');
        if (!sup) return;
        const donorAvg = runAvgs[donor.runIndex];
        if (donorAvg > bestAvg) {
          bestAvg = donorAvg;
          bestDonorIdx = idx;
        }
      });
    } else {
      // 타겟 공대가 상대적으로 강함 → 더 약한 공대에서 서폿을 빼옴
      let bestAvg = Infinity;
      donors.forEach((donor, idx) => {
        const sup = donor.party.members.find(m => m.role === 'SUPPORT');
        if (!sup) return;
        const donorAvg = runAvgs[donor.runIndex];
        if (donorAvg < bestAvg) {
          bestAvg = donorAvg;
          bestDonorIdx = idx;
        }
      });
    }

    // 적당한 donor를 찾지 못하면 이 타겟은 스킵
    if (bestDonorIdx === -1) {
      continue;
    }

    // 3️⃣ 실제 이동 수행
    const donor = donors.splice(bestDonorIdx, 1)[0];
    const supIndex = donor.party.members.findIndex(m => m.role === 'SUPPORT');
    if (supIndex === -1) {
      continue;
    }

    const sup = donor.party.members.splice(supIndex, 1)[0];
    target.party.members.push(sup);
  }

  return result;
}



// ✅ 메인 함수
export function buildRaidSchedule(
  characters: Character[],
  exclusions: RaidExclusionMap = {},
  balanceMode: BalanceMode = 'speed',
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
    const supportShortage = Boolean(raidSettings?.[raidId]);

    const pool = supportShortage
      ? promoteValkyToSupportIfNeeded(raidId, characters)
      : characters;

    // ✅ balanceMode는 그대로 전달 (speed/overall/role 전부 사용 가능)
    schedule[raidId] = distributeCharactersIntoRuns(
      raidId,
      pool,
      balanceMode,
      seededRng,
      supportShortage,
    );
  });


  return schedule;
}
