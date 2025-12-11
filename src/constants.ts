import type { RaidId } from './types';

export const JOB_OPTIONS = [
  '디트',
  '워로',
  '버서',
  '홀나',
  '슬레',
  '발키',
  '배마',
  '인파',
  '기공',
  '창술',
  '스커',
  '브커',
  '데헌',
  '블래',
  '호크',
  '스카',
  '건슬',
  '바드',
  '섬너',
  '알카',
  '소서',
  '블레',
  '데모',
  '리퍼',
  '소울',
  '도화',
  '기상',
  '환수',
  '가나'
];

export const ROLE_OPTIONS = [
  { value: 'DPS' as const, label: '딜러' },
  { value: 'SUPPORT' as const, label: '서포터' }
];

export const RAID_META: Record<
  RaidId,
  { label: string; difficulty: 'HARD' | 'NORMAL'; colorClass: string }
> = {
  ACT3_HARD: {
    label: '3막 하드',
    difficulty: 'HARD',
    colorClass: 'bg-orange-400'
  },
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
