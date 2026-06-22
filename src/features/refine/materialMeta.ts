// 재료 데이터 키 → 게임 아이콘 + 등급 매핑.
// 아이콘 URL은 로스트아크 시세 데이터(market-cron)의 Icon 필드에서 가져온 것.
// 키는 시세/계산용 식별자이며, 여기서는 표시용 메타만 정의한다.
const ICON_BASE = 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/';

export type ItemGrade =
  | '일반'
  | '고급'
  | '희귀'
  | '영웅'
  | '전설'
  | '유물'
  | '고대';

interface MaterialMeta {
  icon: string;
  grade: ItemGrade;
}

const RAW: Record<string, [string, ItemGrade]> = {
  파편: ['use_8_225.png', '고급'],
  운명파편: ['use_12_91.png', '고급'],
  중급오레하: ['use_9_71.png', '희귀'],
  상급오레하: ['use_8_109.png', '영웅'],
  최상급오레하: ['use_11_29.png', '영웅'],
  아비도스: ['use_12_86.png', '희귀'],
  상급아비도스: ['use_13_252.png', '영웅'],
  명돌: ['use_7_155.png', '희귀'],
  위명돌: ['use_7_156.png', '희귀'],
  경명돌: ['use_7_157.png', '희귀'],
  찬명돌: ['use_11_17.png', '희귀'],
  운돌: ['use_12_85.png', '희귀'],
  위운돌: ['use_13_251.png', '희귀'],
  수결: ['use_6_104.png', '일반'],
  파결: ['use_6_105.png', '일반'],
  수호강석: ['use_10_59.png', '일반'],
  파괴강석: ['use_10_58.png', '일반'],
  정제된수호강석: ['use_11_16.png', '일반'],
  정제된파괴강석: ['use_11_15.png', '일반'],
  운명의수호석: ['use_12_89.png', '일반'],
  운명의파괴석: ['use_12_88.png', '일반'],
  운명의수호석결정: ['use_13_250.png', '일반'],
  운명의파괴석결정: ['use_13_249.png', '일반'],
  은총: ['use_7_161.png', '고급'],
  축복: ['use_7_162.png', '희귀'],
  가호: ['use_7_163.png', '영웅'],
  빙하: ['use_12_172.png', '영웅'],
  용암: ['use_12_171.png', '영웅'],
  재봉술기본: ['use_6_226.png', '영웅'],
  재봉술응용: ['use_6_226.png', '전설'],
  재봉술심화: ['use_6_226.png', '유물'],
  재봉술숙련: ['use_7_70.png', '유물'],
  재봉술특화: ['use_7_70.png', '고대'],
  재봉술전문: ['use_7_70.png', '고대'],
  재봉술복합: ['use_7_70.png', '고대'],
  재봉술업화A: ['use_12_219.png', '유물'],
  재봉술업화B: ['use_12_219.png', '유물'],
  재봉술업화C: ['use_12_219.png', '유물'],
  야금술기본: ['use_6_222.png', '영웅'],
  야금술응용: ['use_6_222.png', '전설'],
  야금술심화: ['use_6_222.png', '유물'],
  야금술숙련: ['use_7_69.png', '유물'],
  야금술특화: ['use_7_69.png', '고대'],
  야금술전문: ['use_7_69.png', '고대'],
  야금술복합: ['use_7_69.png', '고대'],
  야금술업화A: ['use_12_218.png', '유물'],
  야금술업화B: ['use_12_218.png', '유물'],
  야금술업화C: ['use_12_218.png', '유물'],
  장인의재봉술1단계: ['use_12_243.png', '영웅'],
  장인의재봉술2단계: ['use_12_245.png', '전설'],
  장인의재봉술3단계: ['use_13_222.png', '유물'],
  장인의재봉술4단계: ['use_13_224.png', '고대'],
  장인의야금술1단계: ['use_12_242.png', '영웅'],
  장인의야금술2단계: ['use_12_244.png', '전설'],
  장인의야금술3단계: ['use_13_221.png', '유물'],
  장인의야금술4단계: ['use_13_223.png', '고대'],
};

export const MATERIAL_META: Record<string, MaterialMeta> = Object.fromEntries(
  Object.entries(RAW).map(([key, [icon, grade]]) => [
    key,
    { icon: ICON_BASE + icon, grade },
  ])
);

// 등급별 테두리(ring) 색 — 로스트아크 등급 컬러 관습에 맞춤.
export const GRADE_RING: Record<ItemGrade, string> = {
  일반: 'ring-zinc-300 dark:ring-zinc-600',
  고급: 'ring-lime-400/70',
  희귀: 'ring-sky-400/70',
  영웅: 'ring-purple-400/70',
  전설: 'ring-amber-400/80',
  유물: 'ring-orange-400/80',
  고대: 'ring-yellow-200/90',
};
