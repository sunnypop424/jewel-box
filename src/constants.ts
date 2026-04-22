// RAID_META 는 레이드 레지스트리로 이동 — 기존 import 경로 호환을 위해 재수출.
export { RAID_META } from './data/raids';

export const JOB_OPTIONS = [
  '디스트로이어',
  '워로드',
  '버서커',
  '홀리나이트',
  '슬레이어',
  '발키리',
  '배틀마스터',
  '인파이터',
  '기공사',
  '창술사',
  '스트라이커',
  '브레이커',
  '데빌헌터',
  '블래스터',
  '호크아이',
  '스카우터',
  '건슬링어',
  '바드',
  '서머너',
  '아르카나',
  '소서리스',
  '블레이드',
  '데모닉',
  '리퍼',
  '소울이터',
  '도화가',
  '기상술사',
  '환수사',
  '가디언나이트'
];

export const ROLE_OPTIONS = [
  { value: 'DPS' as const, label: '딜러' },
  { value: 'SUPPORT' as const, label: '서포터' }
];
