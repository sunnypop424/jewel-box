import { collection, doc, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, query, where, orderBy, arrayUnion, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import type { Character, RaidSettingsMap, RaidSwap, RaidId, RaidExclusionMap, ClearEntry, WeeklyClears, RosterRaidState, RosterRaidSelection } from '../types';
import type { RaidFamily } from '../data/raids';
import { getRaidFamily, ALL_RAID_IDS } from '../data/raids';

const USERS_COLLECTION = collection(db, 'users');
const SETTINGS_DOC_REF = doc(db, 'raidData', 'settings');
const SWAPS_DOC_REF = doc(db, 'raidData', 'swaps');
const CLEARS_DOC_REF = doc(db, 'raidData', 'clears');
const ROSTER_RAID_STATE_DOC_REF = doc(db, 'raidData', 'rosterRaidState');
const GOLD_DOC_REF = doc(db, 'raidData', 'accumulatedGold');
// 공대원 개인 일정 컬렉션 (참여 불가일)
// 각 문서 = 하나의 일정. 구조: { discordName, discordId?, date(YYYY-MM-DD), reason, createdAt, updatedAt, source }
const SCHEDULES_COLLECTION = collection(db, 'personalSchedules');

export type AccumulatedGoldMap = Record<string, { general: number; bound: number }>;

// 읽어올 때 rosterId 기본값(= discordName) 주입. 기존 데이터 호환 + 다중 원정대 전환 준비.
function normalizeCharacter(c: Character): Character {
  return { ...c, rosterId: c.rosterId || c.discordName };
}

export async function fetchCharacters(discordName?: string): Promise<Character[]> {
  if (discordName) {
    const snap = await getDoc(doc(USERS_COLLECTION, discordName));
    const chars: Character[] = snap.exists() ? (snap.data().characters || []) : [];
    return chars.map(normalizeCharacter);
  } else {
    const snap = await getDocs(USERS_COLLECTION);
    const allChars: Character[] = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data.characters) allChars.push(...data.characters);
    });
    return allChars.map(normalizeCharacter);
  }
}

export async function saveCharacters(discordName: string, characters: Character[]): Promise<void> {
  await setDoc(doc(USERS_COLLECTION, discordName), { characters }, { merge: true });
}

export async function fetchRaidSettings(): Promise<RaidSettingsMap> {
  const snap = await getDoc(SETTINGS_DOC_REF);
  return snap.exists() ? (snap.data().supportShortageByRaid || {}) : {};
}

export async function setRaidSetting(raidId: RaidId, supportShortage: boolean): Promise<RaidSettingsMap> {
  await setDoc(SETTINGS_DOC_REF, { supportShortageByRaid: { [raidId]: supportShortage } }, { merge: true });
  return await fetchRaidSettings();
}

export async function resetRaidSettings(): Promise<RaidSettingsMap> {
  await setDoc(SETTINGS_DOC_REF, { supportShortageByRaid: {} });
  return {};
}

export async function fetchSwaps(): Promise<RaidSwap[]> {
  const snap = await getDoc(SWAPS_DOC_REF);
  return snap.exists() ? (snap.data().swaps || []) : [];
}

export async function addSwap(raidId: string, charId1: string, charId2: string): Promise<RaidSwap[]> {
  const snap = await getDoc(SWAPS_DOC_REF);
  if (!snap.exists()) await setDoc(SWAPS_DOC_REF, { swaps: [] });
  
  const newSwap: RaidSwap = { raidId, charId1, charId2, timestamp: new Date().toISOString() };
  await updateDoc(SWAPS_DOC_REF, { swaps: arrayUnion(newSwap) });
  return await fetchSwaps();
}

export async function resetSwaps(): Promise<RaidSwap[]> {
  await setDoc(SWAPS_DOC_REF, { swaps: [] });
  return [];
}

// =============================================================================
// 주간 클리어 원장 (Ledger) API — raidData/clears
// -----------------------------------------------------------------------------
// 구조: { [charId]: { [raidId]: ClearEntry } }
// 클리어 시점의 골드 스냅샷을 보관해 아이템 레벨 상승 등으로 top3 가 변해도
// 기록이 왜곡되지 않음. 주간 리셋(/초기화 전체) 시 유저별 합산 후 accumulatedGold
// 에 가산하고 원장 전체 삭제.
// =============================================================================

export async function fetchClears(): Promise<WeeklyClears> {
  const snap = await getDoc(CLEARS_DOC_REF);
  return snap.exists() ? (snap.data() as WeeklyClears) : {};
}

// 특정 캐릭의 한 레이드에 엔트리를 write. 덮어쓰기 (cleared 시점 기록).
export async function writeClearEntry(charId: string, entry: ClearEntry): Promise<void> {
  const snap = await getDoc(CLEARS_DOC_REF);
  if (!snap.exists()) await setDoc(CLEARS_DOC_REF, {});
  await updateDoc(CLEARS_DOC_REF, { [`${charId}.${entry.raidId}`]: entry });
}

// 여러 캐릭을 한 번에 write (일괄 완료 처리용).
export async function writeClearEntriesBulk(entries: Array<{ charId: string; entry: ClearEntry }>): Promise<void> {
  if (entries.length === 0) return;
  const snap = await getDoc(CLEARS_DOC_REF);
  if (!snap.exists()) await setDoc(CLEARS_DOC_REF, {});
  const updates: Record<string, unknown> = {};
  for (const { charId, entry } of entries) {
    updates[`${charId}.${entry.raidId}`] = entry;
  }
  await updateDoc(CLEARS_DOC_REF, updates);
}

// 엔트리 삭제 (완료 취소).
export async function deleteClearEntry(charId: string, raidId: RaidId): Promise<void> {
  const snap = await getDoc(CLEARS_DOC_REF);
  if (!snap.exists()) return;
  await updateDoc(CLEARS_DOC_REF, { [`${charId}.${raidId}`]: deleteField() });
}

// 원장 전체 리셋 (/초기화 전체 후단에서 사용).
export async function resetClears(): Promise<WeeklyClears> {
  await setDoc(CLEARS_DOC_REF, {});
  return {};
}

// =============================================================================
// 원정대 스코프 레이드 상태 (rosterRaidState) API
// 구조: { [rosterId]: { [raidFamily]: { selectedCharId, difficulty } } }
// =============================================================================

export async function fetchRosterRaidState(): Promise<RosterRaidState> {
  const snap = await getDoc(ROSTER_RAID_STATE_DOC_REF);
  return snap.exists() ? (snap.data() as RosterRaidState) : {};
}

export async function writeRosterRaidSelection(
  rosterId: string,
  family: RaidFamily,
  selection: RosterRaidSelection
): Promise<void> {
  const snap = await getDoc(ROSTER_RAID_STATE_DOC_REF);
  if (!snap.exists()) await setDoc(ROSTER_RAID_STATE_DOC_REF, {});
  await updateDoc(ROSTER_RAID_STATE_DOC_REF, { [`${rosterId}.${family}`]: selection });
}

export async function deleteRosterRaidSelection(
  rosterId: string,
  family: RaidFamily
): Promise<void> {
  const snap = await getDoc(ROSTER_RAID_STATE_DOC_REF);
  if (!snap.exists()) return;
  await updateDoc(ROSTER_RAID_STATE_DOC_REF, { [`${rosterId}.${family}`]: deleteField() });
}

export async function resetRosterRaidState(): Promise<RosterRaidState> {
  await setDoc(ROSTER_RAID_STATE_DOC_REF, {});
  return {};
}

// -----------------------------------------------------------------------------
// Adapter: 원장 → RaidExclusionMap
// -----------------------------------------------------------------------------
// raidLogic.ts 등 기존 호출부가 `exclusions[raidId].includes(charId)` 로
// "완료된 캐릭" 을 판정하는데, 이를 원장에서 파생해 그대로 공급.
// 추가: exclusiveDifficulty family 처리 — 한 tier 라도 클리어하면 같은 family
// 의 다른 tier 에도 해당 charId 를 포함시켜 "스케줄 후보 제외" 효과.

export function deriveExclusionsFromClears(clears: WeeklyClears): RaidExclusionMap {
  const out: Partial<Record<RaidId, Set<string>>> = {};
  const addExclusion = (raidId: RaidId, charId: string) => {
    if (!out[raidId]) out[raidId] = new Set();
    out[raidId]!.add(charId);
  };
  for (const charId of Object.keys(clears)) {
    const charClears = clears[charId] || {};
    const clearedFamilies = new Set<string>();
    for (const rId of Object.keys(charClears) as RaidId[]) {
      if (charClears[rId]) clearedFamilies.add(getRaidFamily(rId));
    }
    // 해당 charId 를 cleared family 의 모든 tier 에 추가 (exclusiveDifficulty 반영).
    for (const raidId of ALL_RAID_IDS) {
      if (clearedFamilies.has(getRaidFamily(raidId))) addExclusion(raidId, charId);
    }
  }
  const final: Partial<Record<RaidId, string[]>> = {};
  for (const raidId of Object.keys(out) as RaidId[]) {
    final[raidId] = Array.from(out[raidId]!);
  }
  return final as RaidExclusionMap;
}

// --- 누적 골드 API ---
export async function fetchAccumulatedGold(): Promise<AccumulatedGoldMap> {
  const snap = await getDoc(GOLD_DOC_REF);
  return snap.exists() ? snap.data() as AccumulatedGoldMap : {};
}

export async function updateAccumulatedGoldMulti(updates: { discordName: string; deltaGeneral: number; deltaBound: number }[]): Promise<AccumulatedGoldMap> {
  const snap = await getDoc(GOLD_DOC_REF);
  const current = snap.exists() ? snap.data() as AccumulatedGoldMap : {};
  
  const newData = { ...current };
  for (const u of updates) {
    const userGold = newData[u.discordName] || { general: 0, bound: 0 };
    newData[u.discordName] = {
      general: userGold.general + u.deltaGeneral, 
      bound: userGold.bound + u.deltaBound
    };
  }
  await setDoc(GOLD_DOC_REF, newData);
  return newData;
}

export async function resetAccumulatedGold(discordName: string, offsetGeneral: number = 0, offsetBound: number = 0): Promise<AccumulatedGoldMap> {
  const snap = await getDoc(GOLD_DOC_REF);
  const current = snap.exists() ? snap.data() as AccumulatedGoldMap : {};
  // 초기화 시점의 주간 골드만큼 마이너스 처리해두면 화면상 0이 됨
  const newData = { ...current, [discordName]: { general: -offsetGeneral, bound: -offsetBound } };
  await setDoc(GOLD_DOC_REF, newData);
  return newData;
}

// --- 공대원 개인 일정 (참여 불가일) API ---
export interface PersonalSchedule {
  id: string;
  discordName: string;
  discordId?: string;
  date: string;      // YYYY-MM-DD (KST 기준)
  reason: string;
  createdAt?: string;
  updatedAt?: string;
  source?: 'web' | 'discord';
  // 등록 시 디스코드 채널에 전송한 메시지 ID. 삭제 시 해당 메시지를 함께 지우는 데 사용.
  discordMessageId?: string;
}

export type NewPersonalSchedule = Omit<PersonalSchedule, 'id' | 'createdAt' | 'updatedAt'>;

// 전체 일정 조회 (웹 캘린더에서 월 단위 렌더링 시 사용)
export async function fetchPersonalSchedules(): Promise<PersonalSchedule[]> {
  const snap = await getDocs(query(SCHEDULES_COLLECTION, orderBy('date', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PersonalSchedule, 'id'>) }));
}

// 특정 유저의 일정만 조회 (본인 관리 패널에서 활용 가능)
export async function fetchPersonalSchedulesByUser(discordName: string): Promise<PersonalSchedule[]> {
  const q = query(SCHEDULES_COLLECTION, where('discordName', '==', discordName));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PersonalSchedule, 'id'>) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 일정 등록: 중복 방지(같은 유저/같은 날짜)는 서버 사이드에서 처리하지 않고
// 호출 측(웹/디스코드)에서 각자 확인 후 addPersonalSchedule 또는 updatePersonalSchedule 호출
export async function addPersonalSchedule(data: NewPersonalSchedule): Promise<PersonalSchedule> {
  const now = new Date().toISOString();
  const payload = { ...data, createdAt: now, updatedAt: now, source: data.source || 'web' };
  const docRef = await addDoc(SCHEDULES_COLLECTION, payload);
  return { id: docRef.id, ...payload };
}

// 일정 수정 (사유/날짜 등)
export async function updatePersonalSchedule(
  id: string,
  patch: Partial<Omit<PersonalSchedule, 'id' | 'createdAt' | 'discordName' | 'discordId'>>
): Promise<void> {
  await updateDoc(doc(SCHEDULES_COLLECTION, id), { ...patch, updatedAt: new Date().toISOString() });
}

// 일정 삭제
export async function deletePersonalSchedule(id: string): Promise<void> {
  await deleteDoc(doc(SCHEDULES_COLLECTION, id));
}