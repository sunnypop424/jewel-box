import type { Character } from '../types';

// 🌟 앞서 만드신 Cloudflare Worker 주소로 변경하세요! (끝에 / 제외)
const WORKER_URL = "https://jewel-box.sunnypop424.workers.dev";

const SUPPORT_CLASSES = ['바드', '도화가', '홀리나이트'];

export function getRoleFromClass(className: string): 'DPS' | 'SUPPORT' {
  return SUPPORT_CLASSES.includes(className) ? 'SUPPORT' : 'DPS';
}

export async function fetchSiblings(characterName: string) {
  const res = await fetch(`${WORKER_URL}/characters/${encodeURIComponent(characterName)}/siblings`);
  if (!res.ok) throw new Error('원정대 정보를 불러오지 못했습니다.');
  return await res.json();
}

export async function fetchProfile(characterName: string) {
  const res = await fetch(`${WORKER_URL}/armories/characters/${encodeURIComponent(characterName)}/profiles`);
  if (!res.ok) throw new Error('캐릭터 정보를 불러오지 못했습니다.');
  return await res.json();
}

// 🌟 주간 초기화 시 일괄 스펙 업데이트 
export async function syncCharactersWithLostArkAPI(
  characters: Character[], 
  saveFn: (discordName: string, chars: Character[]) => Promise<void>
): Promise<Character[]> {
  const charsToUpdate = characters.filter(c => c.lostArkName);
  if(charsToUpdate.length === 0) return characters;

  const updatedMap = new Map<string, Character>();
  
  // 5개씩 끊어서 요청 (안전장치)
  const chunkSize = 5;
  for (let i = 0; i < charsToUpdate.length; i += chunkSize) {
    const chunk = charsToUpdate.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (c) => {
      try {
        const profile = await fetchProfile(c.lostArkName!);
        if (profile && profile.ItemAvgLevel && profile.CombatPower) {
          const lv = parseFloat(profile.ItemAvgLevel.replace(/,/g, ''));
          const cp = parseFloat(profile.CombatPower.replace(/,/g, ''));
          updatedMap.set(c.id, { ...c, itemLevel: Math.floor(lv), combatPower: Math.floor(cp) });
        }
      } catch(e) { console.error(`[로아 API 오류] ${c.lostArkName}:`, e); }
    }));
    await new Promise(r => setTimeout(r, 200)); 
  }

  const finalList = characters.map(c => updatedMap.get(c.id) || c);

  // DB 갱신 (유저별 저장)
  const grouped = finalList.reduce((acc, char) => {
    const name = char.discordName;
    if (!acc[name]) acc[name] = [];
    acc[name].push(char);
    return acc;
  }, {} as Record<string, Character[]>);

  for (const [dName, chars] of Object.entries(grouped)) {
     await saveFn(dName, chars);
  }

  return finalList;
}