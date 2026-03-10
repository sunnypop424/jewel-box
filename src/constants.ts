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
  { 
    label: string; 
    difficulty: 'HARD' | 'NORMAL' | 'NIGHTMARE' | 'STEP1' | 'STEP2' | 'STEP3'; 
    colorClass: string; 
    gold: number; 
    goldType: 'GENERAL' | 'BOUND' 
  }
> = {
  ACT2_HARD: { label: '2막 하드', difficulty: 'HARD', colorClass: 'bg-amber-600', gold: 23000, goldType: 'GENERAL' },
  ACT3_HARD: { label: '3막 하드', difficulty: 'HARD', colorClass: 'bg-orange-400', gold: 27000, goldType: 'GENERAL' },
  ACT4_NORMAL: { label: '4막 노말', difficulty: 'NORMAL', colorClass: 'bg-sky-400', gold: 33000, goldType: 'GENERAL' },
  ACT4_HARD: { label: '4막 하드', difficulty: 'HARD', colorClass: 'bg-amber-500', gold: 42000, goldType: 'GENERAL' },
  SERKA_NORMAL: { label: '세르카 노말', difficulty: 'NORMAL', colorClass: 'bg-violet-300', gold: 35000, goldType: 'GENERAL' },
  SERKA_HARD: { label: '세르카 하드', difficulty: 'HARD', colorClass: 'bg-violet-500', gold: 44000, goldType: 'GENERAL' },
  SERKA_NIGHTMARE: { label: '세르카 나이트메어', difficulty: 'NIGHTMARE', colorClass: 'bg-violet-700', gold: 54000, goldType: 'GENERAL' },
  FINAL_NORMAL: { label: '종막 노말', difficulty: 'NORMAL', colorClass: 'bg-emerald-400', gold: 40000, goldType: 'GENERAL' },
  FINAL_HARD: { label: '종막 하드', difficulty: 'HARD', colorClass: 'bg-red-500', gold: 52000, goldType: 'GENERAL' },
  HORIZON_STEP1: { label: '지평의 성당 1단계', difficulty: 'STEP1', colorClass: 'bg-orange-400', gold: 30000, goldType: 'BOUND' },
  HORIZON_STEP2: { label: '지평의 성당 2단계', difficulty: 'STEP2', colorClass: 'bg-orange-500', gold: 40000, goldType: 'BOUND' },
  HORIZON_STEP3: { label: '지평의 성당 3단계', difficulty: 'STEP3', colorClass: 'bg-orange-600', gold: 50000, goldType: 'BOUND' }
};