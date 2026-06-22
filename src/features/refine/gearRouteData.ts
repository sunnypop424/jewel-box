// 등급별 아이템 레벨 공식 + 계승(succession) 전이표 (위키 공식 데이터).
// 목표 아이템 레벨 모드(최저가 루트) 전용. T4 핵심 경로만 다룬다.
//
// 아이템 레벨 = baseIL + 5×일반단계 + 1×상급단계 (상급은 t4_1590만)
// 캐릭터 아이템 레벨 = 6부위 아이템 레벨의 평균.

export type RouteGrade = 't3_1525' | 't4_1590' | 't4_1730';

export interface GradeSpec {
  label: string; // 표시용 세트명
  baseIL: number;
  normalMax: number;
  hasAdvanced: boolean;
  advMax: number;
}

export const GRADE_SPEC: Record<RouteGrade, GradeSpec> = {
  // 낙인(1525 고대): 일반만, baseIL 1525
  t3_1525: { label: '낙인', baseIL: 1525, normalMax: 25, hasAdvanced: false, advMax: 0 },
  // 결단(유물 max20)/업화(고대 max25) — 동일 재련 트랙·테이블. 유물 20→21은 업화 계승(무료 간주).
  t4_1590: { label: '결단/업화', baseIL: 1590, normalMax: 25, hasAdvanced: true, advMax: 40 },
  // 전율(세르카, 1675 고대): 상급재련 없음(계승 시 소멸)
  t4_1730: { label: '전율', baseIL: 1675, normalMax: 25, hasAdvanced: false, advMax: 0 },
};

export function isRouteGrade(grade: string): grade is RouteGrade {
  return grade === 't3_1525' || grade === 't4_1590' || grade === 't4_1730';
}

export function itemLevelOf(grade: RouteGrade, normal: number, adv: number): number {
  return GRADE_SPEC[grade].baseIL + 5 * normal + adv;
}

export interface SuccessionEdge {
  from: RouteGrade;
  to: RouteGrade;
  label: string;
  requireAdv?: number; // 출발 상급단계 필요치 (없으면 무관)
  table: Record<number, number>; // 출발 일반단계 → 도착 일반단계 (상급은 0으로 리셋)
}

export const SUCCESSIONS: SuccessionEdge[] = [
  {
    // 낙인 19강↑ → 결단(T4 유물). 계승 시 더 높은 단계로 점프.
    from: 't3_1525',
    to: 't4_1590',
    label: '결단 계승',
    table: { 19: 10, 20: 11, 21: 12, 22: 13, 23: 14, 24: 16, 25: 18 },
  },
  {
    // 업화 20~25강 + 상급 40강 완료 → 전율(세르카). 상급재련은 사라진다.
    from: 't4_1590',
    to: 't4_1730',
    label: '전율 계승',
    requireAdv: 40,
    table: { 20: 11, 21: 12, 22: 13, 23: 14, 24: 16, 25: 18 },
  },
];

// 상급 단계 활성화 IL 게이트 (t4_1590): 해당 상급단계로 가려면 노드 IL이 이 값 이상이어야 한다.
export function advGateIL(targetAdvStage: number): number {
  if (targetAdvStage >= 31) return 1700;
  if (targetAdvStage >= 21) return 1680;
  if (targetAdvStage >= 1) return 1620;
  return 0;
}
