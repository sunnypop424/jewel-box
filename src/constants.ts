import type { RaidId } from './types';

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

export const RAID_META: Record<
  RaidId,
  { label: string; difficulty: 'HARD' | 'NORMAL' | 'NIGHTMARE'; colorClass: string }
> = {
  ACT4_NORMAL: {
    label: '4막 노말',
    difficulty: 'NORMAL',
    colorClass: 'bg-sky-400'
  },
  ACT4_HARD: {
    label: '4막 하드',
    difficulty: 'HARD',
    colorClass: 'bg-amber-500'
  },
  SERKA_NORMAL: {
    label: '세르카 노말',
    difficulty: 'NORMAL',
    colorClass: 'bg-violet-300'
  },
  SERKA_HARD: {
    label: '세르카 하드',
    difficulty: 'HARD',
    colorClass: 'bg-violet-500'
  },
  SERKA_NIGHTMARE: {
    label: '세르카 나이트메어',
    difficulty: 'NIGHTMARE',
    colorClass: 'bg-violet-700'
  },
  FINAL_NORMAL: {
    label: '종막 노말',
    difficulty: 'NORMAL',
    colorClass: 'bg-emerald-400'
  },
  FINAL_HARD: {
    label: '종막 하드',
    difficulty: 'HARD',
    colorClass: 'bg-red-500'
  }
};