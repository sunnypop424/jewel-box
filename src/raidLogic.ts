import type {
  Character,
  RaidId,
  RaidRun,
  RaidRunParty,
  RaidSchedule,
} from './types';

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

// 레이드별 캐릭터 묶기
function groupCharactersByRaid(characters: Character[]): RaidBucket[] {
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
      map[raidId].push(ch);
    });
  });

  return (Object.keys(map) as RaidId[]).map((raidId) => ({
    raidId,
    // 전투력 높은 순
    characters: map[raidId].sort((a, b) => b.combatPower - a.combatPower),
  }));
}

// 공대(회차)로 배분 –
// 1) 공대 수 최소
// 2) 같은 디코 닉네임은 같은 공대에 2번 들어갈 수 없음
// 3) 공대별 딜러/서폿 전투력 합이 최대한 비슷하도록
function distributeCharactersIntoRuns(
  raidId: RaidId,
  characters: Character[],
): RaidRun[] {
  if (characters.length === 0) return [];

  const maxPerRun = 8; // 공대당 최대 8명 (2파티 × 4)

  // 유저별 이 레이드에서 몇 캐릭인지 계산
  const perPlayerCount: Record<string, number> = {};
  characters.forEach((ch) => {
    perPlayerCount[ch.discordName] =
      (perPlayerCount[ch.discordName] || 0) + 1;
  });

  const maxCharsForOnePlayer = Object.values(perPlayerCount).reduce(
    (max, v) => (v > max ? v : max),
    0,
  );

  // 기본적으로는 총 인원 기준 + 한 유저의 캐릭 수 기준
  const baseRunsBySize = Math.ceil(characters.length / maxPerRun);
  const runCount = Math.max(baseRunsBySize, maxCharsForOnePlayer || 1);

  const runsMembers: Character[][] = Array.from({ length: runCount }, () => []);
  const runsTotalPower: number[] = Array(runCount).fill(0); // 전체 전투력 (표시용)
  const runsDpsPower: number[] = Array(runCount).fill(0);   // 딜러 전투력 합
  const runsSupPower: number[] = Array(runCount).fill(0);   // 서폿 전투력 합
  const runsPlayerCounts: Array<Record<string, number>> = Array.from(
    { length: runCount },
    () => ({}),
  );

  // 전투력 높은 순으로 배치 (센 애부터 낮은 공대에 보내서 균형)
  const sorted = [...characters].sort(
    (a, b) => b.combatPower - a.combatPower,
  );

  sorted.forEach((ch) => {
    let bestIndex = -1;
    let bestScore: [number, number] | null = null;
    // [해당 역할 전투력합, 현재 인원 수]

    for (let i = 0; i < runCount; i++) {
      const size = runsMembers[i].length;
      if (size >= maxPerRun) continue;

      const playerCountInThisRun = runsPlayerCounts[i][ch.discordName] || 0;
      // 같은 디코 닉네임이 이 공대에 이미 있다면 스킵
      if (playerCountInThisRun > 0) continue;

      const rolePower =
        ch.role === 'DPS' ? runsDpsPower[i] : runsSupPower[i];

      const score: [number, number] = [rolePower, size];

      if (!bestScore) {
        bestScore = score;
        bestIndex = i;
      } else {
        // 1. 해당 역할 전투력합이 더 낮은 공대 우선
        // 2. 동점이면 인원 적은 공대 우선
        if (
          score[0] < bestScore[0] ||
          (score[0] === bestScore[0] && score[1] < bestScore[1])
        ) {
          bestScore = score;
          bestIndex = i;
        }
      }
    }

    // 혹시 못 찾았으면(이론상 드물지만) 최소 인원 공대에라도 넣기
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

  const runs: RaidRun[] = [];

  runsMembers.forEach((members, idx) => {
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
// - 파티 최대 2개
// - 파티당 최대 4자리 (딜 3 + 서폿 1 구조)
// - 자리는 비어도 됨 (공팟으로 채운다는 전제)
// - 파티 안에서 딜러 직업 중복 X, 서포터는 최대 1명
// - 공대 안에서는 쎈 파티(파티1) / 약한 파티(파티2)로 나눈다.
//   → 파티1을 웬만하면 먼저 꽉 채우고, 제일 센 서폿 + 제일 센 딜러를 몰아 넣는다.
function splitIntoParties(members: Character[]): RaidRunParty[] {
  const maxParties = 2;
  const maxPartySize = 4;
  const maxDpsPerParty = 3;
  const maxSupPerParty = 1;

  // 전투력 내림차순 정렬
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

  // 같은 캐릭이 중복으로 들어가는 걸 방지하기 위한 집합
  const usedIds = new Set<string>();

  const addMemberToParty = (party: RaidRunParty | undefined, c: Character) => {
    if (!party) return;
    if (usedIds.has(c.id)) return;
    if (party.members.length >= maxPartySize) return;
    party.members.push(c);
    usedIds.add(c.id);
  };

  // 1) 파티1(쎈 파티): 가장 쎈 서폿 1명 먼저 배치 (있다면)
  if (supports.length > 0) {
    addMemberToParty(party1, supports[0]);
  }

  // 2) 파티1(쎈 파티): 가장 쎈 딜러들로 직업 안 겹치게 최대 3명 채우기
  for (const d of dps) {
    if (usedIds.has(d.id)) continue;

    const dpsCountInP1 = party1.members.filter(
      (m) => m.role === 'DPS',
    ).length;
    if (dpsCountInP1 >= maxDpsPerParty) break;

    const hasSameJobInP1 = party1.members.some(
      (m) => m.role === 'DPS' && m.jobCode === d.jobCode,
    );
    if (hasSameJobInP1) continue;

    addMemberToParty(party1, d);
  }

  // 3) 파티2(약한 파티): 남은 서폿 중 1명 배치 (있다면)
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

  // 4) 파티2: 남은 서폿이 더 있고, 자리도 있으면 채우기 (optional)
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

  // 5) 파티2: 남은 딜러들로 채우기 (직업 중복 X, 딜 3명까지)
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

  // 6) 파티에 아무도 없으면 제거
  return parties.filter((p) => p.members.length > 0);
}

// 전체 레이드 일정 생성
export function buildRaidSchedule(characters: Character[]): RaidSchedule {
  const filtered = characters.filter((c) => c.itemLevel >= 1700);
  const buckets = groupCharactersByRaid(filtered);

  const schedule: RaidSchedule = {
    ACT3_HARD: [],
    ACT4_NORMAL: [],
    ACT4_HARD: [],
    FINAL_NORMAL: [],
    FINAL_HARD: [],
  };

  buckets.forEach(({ raidId, characters }) => {
    schedule[raidId] = distributeCharactersIntoRuns(raidId, characters);
  });

  return schedule;
}
