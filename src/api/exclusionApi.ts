import type { RaidId, RaidExclusionMap } from '../types';
import { BASE_URL } from './sheetApi';

interface ExclusionResponse {
  ok: boolean;
  exclusions?: RaidExclusionMap;
  error?: string;
}

async function parseJson(res: Response): Promise<ExclusionResponse> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as ExclusionResponse;
  if (!data.ok) {
    throw new Error(data.error || 'Exclusion API error');
  }
  return data;
}

// 🔹 전체 제외 목록 가져오기 (GET)
export async function fetchRaidExclusions(): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};
  const url = new URL(BASE_URL);
  url.searchParams.set('action', 'getExclusions');

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await parseJson(res);
  return data.exclusions || {};
}

// 🔹 특정 레이드에서 캐릭터 제외 (POST) - 단건
export async function excludeCharacterOnRaid(
  raidId: RaidId,
  characterId: string,
  updatedBy?: string,
): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};

  const payload = {
    action: 'exclude',
    raidId,
    characterId,
    updatedBy,
  };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    // ✅ preflight 막기 위해 application/json 대신 text/plain 사용
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJson(res);
  return data.exclusions || {};
}

// ✅ 여러 캐릭터를 한 번에 제외 (RaidSequenceView “레이드 완료”용)
export async function excludeCharactersOnRaid(
  raidId: RaidId,
  characterIds: string[],
  updatedBy?: string,
): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};

  const uniq = Array.from(new Set(characterIds))
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (uniq.length === 0) return await fetchRaidExclusions();

  const payload = {
    action: 'batchExclude',
    raidId,
    characterIds: uniq,
    updatedBy,
  };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const data = await parseJson(res); // ExclusionResponse { ok, exclusions }
  return data.exclusions || {};
}


// 🔹 제외 내역 전체 초기화 (POST)
export async function resetRaidExclusions(): Promise<RaidExclusionMap> {
  if (!BASE_URL) return {};

  const payload = {
    action: 'resetExclusions',
  };

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseJson(res);
  return data.exclusions || {};
}
