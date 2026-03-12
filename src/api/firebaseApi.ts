import { collection, doc, getDocs, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import type { Character, RaidSettingsMap, RaidSwap, RaidId, RaidExclusionMap } from '../types';

const USERS_COLLECTION = collection(db, 'users');
const SETTINGS_DOC_REF = doc(db, 'raidData', 'settings');
const SWAPS_DOC_REF = doc(db, 'raidData', 'swaps');
const EXCLUSION_DOC_REF = doc(db, 'raidData', 'exclusions');

// --- 1. 캐릭터 API ---
export async function fetchCharacters(discordName?: string): Promise<Character[]> {
  if (discordName) {
    const snap = await getDoc(doc(USERS_COLLECTION, discordName));
    return snap.exists() ? (snap.data().characters || []) : [];
  } else {
    const snap = await getDocs(USERS_COLLECTION);
    const allChars: Character[] = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data.characters) allChars.push(...data.characters);
    });
    return allChars;
  }
}

export async function saveCharacters(discordName: string, characters: Character[]): Promise<void> {
  await setDoc(doc(USERS_COLLECTION, discordName), { characters }, { merge: true });
}

// --- 2. 랏폿 설정 API ---
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

// --- 3. 스왑 API ---
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

// --- 4. 완료(Exclusion) API ---
export async function fetchRaidExclusions(): Promise<RaidExclusionMap> {
  const snap = await getDoc(EXCLUSION_DOC_REF);
  return snap.exists() ? snap.data() as RaidExclusionMap : {};
}

export async function toggleCharacterOnRaid(raidId: RaidId, characterId: string, isCurrentlyExcluded: boolean): Promise<RaidExclusionMap> {
  const snap = await getDoc(EXCLUSION_DOC_REF);
  if (!snap.exists()) await setDoc(EXCLUSION_DOC_REF, {});

  await updateDoc(EXCLUSION_DOC_REF, {
    [raidId]: isCurrentlyExcluded ? arrayRemove(characterId) : arrayUnion(characterId)
  });
  return await fetchRaidExclusions();
}

export async function excludeCharactersOnRaid(raidId: RaidId, characterIds: string[]): Promise<RaidExclusionMap> {
  const snap = await getDoc(EXCLUSION_DOC_REF);
  if (!snap.exists()) await setDoc(EXCLUSION_DOC_REF, {});

  if (characterIds.length > 0) {
    await updateDoc(EXCLUSION_DOC_REF, {
      [raidId]: arrayUnion(...characterIds)
    });
  }
  return await fetchRaidExclusions();
}

export async function resetRaidExclusions(): Promise<RaidExclusionMap> {
  await setDoc(EXCLUSION_DOC_REF, {});
  return {};
}