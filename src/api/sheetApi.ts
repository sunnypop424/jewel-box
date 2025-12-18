import type { Character } from '../types';

// ✅ 실제 배포한 Apps Script 웹앱 URL로 교체
export const BASE_URL =
  'https://script.google.com/macros/s/AKfycby_AulGeGdc0BN_zHGrTrUQI2R55uHC2sQME0qLNsyYWS20cc5M42TnxZz7hnlonuaqOw/exec';

if (!BASE_URL) {
  console.warn(
    '[sheetApi] BASE_URL가 설정되지 않았습니다. Apps Script 웹앱 URL로 교체하세요.',
  );
}

// 전체 캐릭터 목록 조회 (옵션: 특정 디스코드만)
export async function fetchCharacters(
  discordName?: string,
): Promise<Character[]> {
  if (!BASE_URL) return [];

  const url = new URL(BASE_URL);
  if (discordName) {
    url.searchParams.set('discordName', discordName);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`fetchCharacters 실패: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data || []).map((c: any) => ({
    id: String(c.id),
    discordName: String(c.discordName),
    jobCode: String(c.jobCode),
    role: c.role === 'SUPPORT' ? 'SUPPORT' : 'DPS',
    itemLevel: Number(c.itemLevel),
    combatPower: Number(c.combatPower),
  }));
}

// 캐릭터 저장
export async function saveCharacters(
  discordName: string,
  characters: Character[],
): Promise<void> {
  if (!BASE_URL) return;

  const payload = { discordName, characters };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`saveCharacters 실패: ${res.status} ${res.statusText}`);
  }
}
