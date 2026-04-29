import type { Mission } from '../types';

// POOL 미션의 룰/기준 라벨. CUSTOM 은 customCriterion 으로 대체.
const POOL_LUCK_LABEL: Record<NonNullable<Mission['poolLuckRule']>, string> = {
  RANDOM: '랜덤(룰렛)',
  LOWEST_HP: '잔혈',
  MAIN_MVP: '메인 MVP',
  CUSTOM: '직접 입력',
};

const POOL_COMPETE_LABEL: Record<NonNullable<Mission['competeCriterion']>, string> = {
  TOP_DPS: '딜 1등',
  CUSTOM: '직접 입력',
};

// 미션 카드/디스코드에 표시할 제목.
// 사용자가 title 을 입력했으면 그대로, 비어있으면 룰/기준 라벨로 폴백.
// (POOL 타입은 title 을 선택 입력으로 두는 정책: 룰 자체가 미션 정체성인 경우)
export function getMissionDisplayTitle(mission: Mission): string {
  const userTitle = (mission.title || '').trim();
  if (userTitle) return userTitle;

  if (mission.type === 'POOL_LUCK' && mission.poolLuckRule) {
    if (mission.poolLuckRule === 'CUSTOM') {
      return (mission.customCriterion || '').trim() || '미션';
    }
    return POOL_LUCK_LABEL[mission.poolLuckRule];
  }
  if (mission.type === 'POOL_COMPETE' && mission.competeCriterion) {
    if (mission.competeCriterion === 'CUSTOM') {
      return (mission.customCriterion || '').trim() || '미션';
    }
    return POOL_COMPETE_LABEL[mission.competeCriterion];
  }
  return '미션';
}

// 사용자가 직접 입력한 title 이 있는지 여부.
// 카드에서 ruleSummary 를 별도로 표시할지 결정하는 데 사용
// (title 비어있으면 displayTitle 자체가 이미 룰이라 ruleSummary 중복 표시 방지).
export function hasUserProvidedTitle(mission: Mission): boolean {
  return !!(mission.title && mission.title.trim());
}
