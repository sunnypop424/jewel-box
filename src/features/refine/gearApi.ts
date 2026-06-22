// 캐릭터 장비 조회 + 재련 수치 파싱.
// 기존 loa-proxy 워커(jewel-box.sunnypop424.workers.dev)가 LoA 공식 API를
// generic passthrough(CORS 우회 + Authorization 주입)하므로 그대로 사용한다.
const WORKER_URL = 'https://jewel-box.sunnypop424.workers.dev';

export type SlotKey = 'weapon' | 'head' | 'shoulder' | 'chest' | 'pants' | 'gloves';

export interface GearPiece {
  slot: SlotKey;
  slotLabel: string;
  type: 'weapon' | 'armor';
  grade: string; // refineData 등급 키 추정 (t4_1590 등)
  advTier: 't3' | 't4';
  currentNormal: number;
  currentAdv: number;
  itemLevel?: number;
}

// LoA Type(한글) → 슬롯
const SLOT_BY_TYPE: Record<string, { slot: SlotKey; label: string }> = {
  무기: { slot: 'weapon', label: '무기' },
  투구: { slot: 'head', label: '투구' },
  머리: { slot: 'head', label: '투구' },
  어깨: { slot: 'shoulder', label: '어깨' },
  상의: { slot: 'chest', label: '상의' },
  하의: { slot: 'pants', label: '하의' },
  장갑: { slot: 'gloves', label: '장갑' },
};

const SLOT_ORDER: SlotKey[] = ['weapon', 'head', 'shoulder', 'chest', 'pants', 'gloves'];

interface RawItem {
  Type: string;
  Name: string;
  Grade: string;
  Tooltip: string;
}

// 세트 명칭/등급 → refineData 등급 키 + 상급 버킷 티어 추정.
// 비용은 견적(근사)이며, UI에서 등급 드롭다운으로 덮어쓸 수 있다.
function guessGrade(name: string, grade: string, itemLevel?: number): {
  grade: string;
  advTier: 't3' | 't4';
} {
  // 결단(유물 20강)/업화(고대 25강) = 같은 세트(운돌·아비도스) → t4_1590 (11~25 커버)
  // 전율(세르카 1675) = 상위 재료(위운돌·상급아비도스) → t4_1730
  if (name.includes('전율')) return { grade: 't4_1730', advTier: 't4' };
  if (name.includes('결단') || name.includes('업화'))
    return { grade: 't4_1590', advTier: 't4' };
  if (name.includes('낙인')) return { grade: 't3_1525', advTier: 't3' };
  if (name.includes('속삭임')) return { grade: 't3_1390', advTier: 't3' };
  if (name.includes('송곳니') || name.includes('차원'))
    return { grade: 't3_1250', advTier: 't3' };

  // 세트명 미인식 시 등급/아이템 레벨로 추정
  const lv = itemLevel ?? 0;
  if (lv >= 1590 || grade === '고대' || grade === '유물') {
    return { grade: 't4_1590', advTier: 't4' };
  }
  if (lv >= 1525) return { grade: 't3_1525', advTier: 't3' };
  if (lv >= 1390) return { grade: 't3_1390', advTier: 't3' };
  return { grade: 't3_1250', advTier: 't3' };
}

function parseNormal(name: string): number {
  const m = name.match(/^\+(\d+)/);
  return m ? Number(m[1]) : 0;
}

function parseAdvanced(tooltip: string): number {
  // 예: [상급 재련] <FONT COLOR='#FFD200'>40</FONT>단계
  const m = tooltip.match(/\[상급 재련\][\s\S]*?>(\d+)<\/FONT>단계/);
  return m ? Number(m[1]) : 0;
}

function parseItemLevel(tooltip: string): number | undefined {
  const m = tooltip.match(/아이템 레벨\s*(\d+)/);
  return m ? Number(m[1]) : undefined;
}

export function parseEquipment(raw: RawItem[]): GearPiece[] {
  const bySlot = new Map<SlotKey, GearPiece>();
  for (const it of raw) {
    const slotInfo = SLOT_BY_TYPE[it.Type];
    if (!slotInfo || bySlot.has(slotInfo.slot)) continue;
    const tooltip = it.Tooltip ?? '';
    const itemLevel = parseItemLevel(tooltip);
    const { grade, advTier } = guessGrade(it.Name ?? '', it.Grade ?? '', itemLevel);
    bySlot.set(slotInfo.slot, {
      slot: slotInfo.slot,
      slotLabel: slotInfo.label,
      type: slotInfo.slot === 'weapon' ? 'weapon' : 'armor',
      grade,
      advTier,
      currentNormal: parseNormal(it.Name ?? ''),
      currentAdv: parseAdvanced(tooltip),
      itemLevel,
    });
  }
  return SLOT_ORDER.map((s) => bySlot.get(s)).filter((p): p is GearPiece => !!p);
}

export async function fetchEquipment(name: string): Promise<GearPiece[]> {
  const res = await fetch(
    `${WORKER_URL}/armories/characters/${encodeURIComponent(name)}/equipment`
  );
  if (!res.ok) throw new Error('장비 정보를 불러오지 못했습니다.');
  const data = (await res.json()) as RawItem[] | null;
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error('캐릭터를 찾을 수 없습니다.');
  }
  const pieces = parseEquipment(data);
  if (pieces.length === 0) {
    throw new Error('장비 정보를 해석하지 못했습니다.');
  }
  return pieces;
}
