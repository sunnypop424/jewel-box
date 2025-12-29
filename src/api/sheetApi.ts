import type { Character, RaidExclusionMap, RaidId, RaidSettingsMap } from '../types';

// ✅ 실제 배포한 Apps Script 웹앱 URL로 교체
export const BASE_URL =
  'https://script.google.com/macros/s/AKfycby_AulGeGdc0BN_zHGrTrUQI2R55uHC2sQME0qLNsyYWS20cc5M42TnxZz7hnlonuaqOw/exec';

if (!BASE_URL) {
  console.warn('[sheetApi] BASE_URL가 설정되지 않았습니다. Apps Script 웹앱 URL로 교체하세요.');
}

async function assertOk(res: Response, label: string) {
  if (!res.ok) {
    throw new Error(`${label} 실패: ${res.status} ${res.statusText}`);
  }
}

/** 전체 캐릭터 목록 조회 (옵션: 특정 디스코드만) */
export async function fetchCharacters(discordName?: string): Promise<Character[]> {
  if (!BASE_URL) return [];

  const url = new URL(BASE_URL);
  if (discordName) url.searchParams.set('discordName', discordName);

  const res = await fetch(url.toString());
  await assertOk(res, 'fetchCharacters');

  const data = await res.json();
  return (data || []).map((c: any) => ({
    id: String(c.id),
    discordName: String(c.discordName),
    jobCode: String(c.jobCode),
    role: c.role === 'SUPPORT' ? 'SUPPORT' : 'DPS',
    itemLevel: Number(c.itemLevel),
    combatPower: Number(c.combatPower),

    serkaNightmare: typeof c.serkaNightmare === 'boolean' ? c.serkaNightmare : undefined,
    valkyCanSupport: typeof c.valkyCanSupport === 'boolean' ? c.valkyCanSupport : undefined,
  }));
}

/** 캐릭터 저장 */
export async function saveCharacters(discordName: string, characters: Character[]): Promise<void> {
  if (!BASE_URL) return;

  const payload = { discordName, characters };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  await assertOk(res, 'saveCharacters');
}

/** 제외 목록 조회 */
export async function fetchExclusions(): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};

  const url = new URL(BASE_URL);
  url.searchParams.set('action', 'getExclusions');

  const res = await fetch(url.toString());
  await assertOk(res, 'fetchExclusions');

  const data = await res.json();
  return (data?.exclusions || {}) as RaidExclusionMap;
}

/** 레이드 제외 등록 */
export async function excludeCharacter(
  raidId: RaidId,
  characterId: string,
  updatedBy?: string,
): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};

  const payload = { action: 'exclude', raidId, characterId, updatedBy };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'excludeCharacter');

  const data = await res.json();
  return (data?.exclusions || {}) as RaidExclusionMap;
}

/** 제외 목록 초기화 */
export async function resetExclusions(): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};

  const payload = { action: 'resetExclusions' };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'resetExclusions');

  const data = await res.json();
  return (data?.exclusions || {}) as RaidExclusionMap;
}

/** ✅ 레이드별 랏폿 설정 조회 */
export async function fetchRaidSettings(): Promise<RaidSettingsMap> {
  if (!BASE_URL) return {};

  const url = new URL(BASE_URL);
  url.searchParams.set('action', 'getRaidSettings');

  const res = await fetch(url.toString());
  await assertOk(res, 'fetchRaidSettings');

  const data = await res.json();
  return (data?.supportShortageByRaid || {}) as RaidSettingsMap;
}

/** ✅ 레이드별 랏폿 설정 저장(업서트) */
export async function setRaidSetting(
  raidId: RaidId,
  supportShortage: boolean,
  updatedBy?: string,
): Promise<RaidSettingsMap> {
  if (!BASE_URL) return {};

  const payload = { action: 'setRaidSetting', raidId, supportShortage, updatedBy };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'setRaidSetting');

  const data = await res.json();
  return (data?.supportShortageByRaid || {}) as RaidSettingsMap;
}

/** ✅ 레이드별 랏폿 설정 초기화 */
export async function resetRaidSettings(): Promise<RaidSettingsMap> {
  if (!BASE_URL) return {};

  const payload = { action: 'resetRaidSettings' };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  await assertOk(res, 'resetRaidSettings');

  const data = await res.json();
  return (data?.supportShortageByRaid || {}) as RaidSettingsMap;
}
