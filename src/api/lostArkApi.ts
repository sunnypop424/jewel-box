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
  saveFn: (discordName: string, chars: Character[]) => Promise<void>,
  onSkip?: (msg: string) => void // ✅ 외부로 메시지를 보낼 콜백
): Promise<Character[]> {
  const charsToUpdate = characters.filter(c => c.lostArkName);
  if(charsToUpdate.length === 0) return characters;

  const updatedMap = new Map<string, Character>();
  
  const chunkSize = 5;
  for (let i = 0; i < charsToUpdate.length; i += chunkSize) {
    const chunk = charsToUpdate.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (c) => {
      try {
        const profile = await fetchProfile(c.lostArkName!);
        if (profile && profile.ItemAvgLevel && profile.CombatPower) {
          const lv = parseFloat(profile.ItemAvgLevel.replace(/,/g, ''));
          const cp = parseFloat(profile.CombatPower.replace(/,/g, ''));
          
          if (cp >= c.combatPower) {
            updatedMap.set(c.id, { ...c, itemLevel: Math.floor(lv), combatPower: Math.floor(cp) });
          } else {
            // ✅ 스킵된 캐릭터의 정보를 콜백으로 전달
            const msg = `- ${c.lostArkName} (기존 ${c.combatPower} ➔ 현재 ${Math.floor(cp)})`;
            console.log(`[스킵됨] ${msg}`);
            if (onSkip) onSkip(msg);
          }
        }
      } catch(e) { console.error(`[로아 API 오류] ${c.lostArkName}:`, e); }
    }));
    await new Promise(r => setTimeout(r, 200)); 
  }

  const finalList = characters.map(c => updatedMap.get(c.id) || c);

  // DB 업데이트 (유저별 저장)
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