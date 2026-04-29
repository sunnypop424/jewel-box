import React, { useState } from 'react';
import {
  Coins,
  Crosshair,
  Dice5,
  Swords,
  Trophy,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  Trash2,
} from 'lucide-react';
import type { Mission } from '../types';
import { getMissionDisplayTitle, hasUserProvidedTitle } from '../utils/missionTitle';

interface Props {
  mission: Mission;
  onMarkSuccess: (m: Mission) => void;
  onMarkFailed: (m: Mission) => void;
  onRequestVoid: (m: Mission) => void;
  onRequestRouletteSpin: (m: Mission) => void;
  onPickWinner: (m: Mission, winner: string) => void;
  onTogglePaid: (m: Mission, next: boolean) => void;
  onToggleReceived: (m: Mission, next: boolean) => void;
  onDelete: (m: Mission) => void;
}

const TYPE_META: Record<Mission['type'], { label: string; Icon: typeof Crosshair; color: string }> = {
  DIRECT: { label: '1:1', Icon: Crosshair, color: 'text-rose-500' },
  POOL_LUCK: { label: '운빨', Icon: Dice5, color: 'text-amber-500' },
  POOL_COMPETE: { label: '경쟁', Icon: Swords, color: 'text-indigo-500' },
};

const STATUS_META: Record<
  Mission['status'],
  { label: string; bg: string; fg: string }
> = {
  OPEN: { label: '진행 중', bg: 'bg-amber-100 dark:bg-amber-900/30', fg: 'text-amber-700 dark:text-amber-300' },
  RESOLVING: { label: '수령자 결정', bg: 'bg-violet-100 dark:bg-violet-900/30', fg: 'text-violet-700 dark:text-violet-300' },
  SETTLED: { label: '정산 대기', bg: 'bg-indigo-100 dark:bg-indigo-900/30', fg: 'text-indigo-700 dark:text-indigo-300' },
  COMPLETED: { label: '정산 완료', bg: 'bg-zinc-200 dark:bg-zinc-700', fg: 'text-zinc-600 dark:text-zinc-300' },
  FAILED: { label: '실패', bg: 'bg-rose-100 dark:bg-rose-900/30', fg: 'text-rose-700 dark:text-rose-300' },
  VOIDED: { label: '무효', bg: 'bg-zinc-100 dark:bg-zinc-800', fg: 'text-zinc-500 dark:text-zinc-400' },
};

const LUCK_RULE_LABEL: Record<NonNullable<Mission['poolLuckRule']>, string> = {
  RANDOM: '랜덤(룰렛)',
  LOWEST_HP: '잔혈',
  MAIN_MVP: '메인 MVP',
  CUSTOM: '직접 입력',
};

const COMPETE_LABEL: Record<NonNullable<Mission['competeCriterion']>, string> = {
  TOP_DPS: '딜 1등',
  CUSTOM: '직접 입력',
};

// === 표준 inline 액션 버튼 클래스 ===
const INLINE_BTN_BASE =
  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50';
const INLINE_BTN_SUCCESS = `${INLINE_BTN_BASE} bg-emerald-600 text-white hover:bg-emerald-500`;
const INLINE_BTN_DANGER = `${INLINE_BTN_BASE} bg-rose-600 text-white hover:bg-rose-500`;
const INLINE_BTN_NEUTRAL = `${INLINE_BTN_BASE} bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700`;
const INLINE_BTN_PRIMARY = `${INLINE_BTN_BASE} bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-500/30`;
const INLINE_BTN_VIOLET = `${INLINE_BTN_BASE} w-full justify-center bg-violet-600 px-4 py-2.5 text-sm text-white hover:bg-violet-500 shadow-sm shadow-violet-500/30`;

export const MissionCard: React.FC<Props> = ({
  mission,
  onMarkSuccess,
  onMarkFailed,
  onRequestVoid,
  onRequestRouletteSpin,
  onPickWinner,
  onTogglePaid,
  onToggleReceived,
  onDelete,
}) => {
  const typeMeta = TYPE_META[mission.type];
  const statusMeta = STATUS_META[mission.status];
  const isCompleted = mission.status === 'COMPLETED';
  const isFailed = mission.status === 'FAILED';
  const isVoided = mission.status === 'VOIDED';
  const isTerminal = isCompleted || isFailed || isVoided;

  // RESOLVING 상태에서 수령자 픽 chip
  const [pickedWinner, setPickedWinner] = useState<string>('');

  const displayTitle = getMissionDisplayTitle(mission);
  const titleWasUserProvided = hasUserProvidedTitle(mission);

  const ruleSummary = (() => {
    if (mission.type === 'POOL_LUCK' && mission.poolLuckRule) {
      const base = LUCK_RULE_LABEL[mission.poolLuckRule];
      return mission.poolLuckRule === 'CUSTOM' && mission.customCriterion
        ? `${base}: ${mission.customCriterion}`
        : base;
    }
    if (mission.type === 'POOL_COMPETE' && mission.competeCriterion) {
      const base = COMPETE_LABEL[mission.competeCriterion];
      return mission.competeCriterion === 'CUSTOM' && mission.customCriterion
        ? `${base}: ${mission.customCriterion}`
        : base;
    }
    return null;
  })();

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm transition ${
        isTerminal
          ? 'border-zinc-200 bg-zinc-50/60 opacity-80 dark:border-zinc-800 dark:bg-zinc-900/30'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold ${typeMeta.color} dark:bg-zinc-800`}
            >
              <typeMeta.Icon size={10} />
              {typeMeta.label}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusMeta.bg} ${statusMeta.fg}`}>
              {statusMeta.label}
            </span>
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{displayTitle}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-bold text-zinc-700 dark:text-zinc-200">{mission.issuer}</span>
            {mission.type === 'DIRECT' && mission.target ? (
              <>
                {' '}→{' '}
                <span className="font-bold text-zinc-700 dark:text-zinc-200">{mission.target}</span>
              </>
            ) : null}
            {mission.type !== 'DIRECT' && mission.poolMembers ? (
              <> — 후보: {mission.poolMembers.join(', ')}</>
            ) : null}
          </p>
          {titleWasUserProvided && ruleSummary && (
            <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">기준: {ruleSummary}</p>
          )}
          {mission.description && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{mission.description}</p>
          )}
          {mission.voidReason && (
            <p className="mt-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
              무효 사유: {mission.voidReason}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <Coins size={14} />
          <span className="text-sm font-extrabold">{mission.goldAmount.toLocaleString()}</span>
        </div>
      </div>

      {/* OPEN: 판정 버튼 */}
      {mission.status === 'OPEN' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onMarkSuccess(mission)} className={INLINE_BTN_SUCCESS}>
            <CheckCircle2 size={14} /> 성공
          </button>
          <button type="button" onClick={() => onMarkFailed(mission)} className={INLINE_BTN_DANGER}>
            <XCircle size={14} /> 실패
          </button>
          <button type="button" onClick={() => onRequestVoid(mission)} className={INLINE_BTN_NEUTRAL}>
            <AlertOctagon size={14} /> 무효
          </button>
        </div>
      )}

      {/* RESOLVING: 수령자 결정 */}
      {mission.status === 'RESOLVING' && (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-200/70 bg-violet-50/60 p-3 dark:border-violet-900/30 dark:bg-violet-950/20">
          {mission.type === 'POOL_LUCK' && mission.poolLuckRule === 'RANDOM' ? (
            <button type="button" onClick={() => onRequestRouletteSpin(mission)} className={INLINE_BTN_VIOLET}>
              <Dice5 size={14} /> 룰렛으로 수령자 정하기
            </button>
          ) : (
            <>
              <p className="text-xs font-bold text-violet-700 dark:text-violet-300">수령자를 선택해주세요</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(mission.poolMembers ?? []).map((m) => {
                  const active = pickedWinner === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPickedWinner(m)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                        active
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-indigo-500/50'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => onRequestVoid(mission)} className={INLINE_BTN_NEUTRAL}>
                  무효 처리
                </button>
                <button
                  type="button"
                  disabled={!pickedWinner}
                  onClick={() => onPickWinner(mission, pickedWinner)}
                  className={INLINE_BTN_PRIMARY}
                >
                  확정
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* SETTLED / COMPLETED: 수령자 + 정산 체크 */}
      {(mission.status === 'SETTLED' || mission.status === 'COMPLETED') && mission.winner && (
        <div className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 dark:border-indigo-900/30 dark:bg-indigo-950/20">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-amber-500" />
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
              {mission.winner}
              {mission.winnerSelectedBy === 'ROULETTE' && (
                <span className="ml-1 text-[10px] font-bold text-zinc-400">(룰렛)</span>
              )}
            </span>
          </div>
          <div className="flex flex-col">
            <label
              className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-colors ${
                isCompleted ? 'cursor-default' : 'cursor-pointer hover:bg-white/60 dark:hover:bg-zinc-900/40'
              }`}
            >
              <input
                type="checkbox"
                checked={!!mission.paidByIssuer}
                onChange={(e) => onTogglePaid(mission, e.target.checked)}
                disabled={isCompleted}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                {mission.issuer} 송금 완료
              </span>
            </label>
            <label
              className={`flex items-center gap-2 rounded-lg px-2 py-1 transition-colors ${
                isCompleted ? 'cursor-default' : 'cursor-pointer hover:bg-white/60 dark:hover:bg-zinc-900/40'
              }`}
            >
              <input
                type="checkbox"
                checked={!!mission.receivedByWinner}
                onChange={(e) => onToggleReceived(mission, e.target.checked)}
                disabled={isCompleted}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                {mission.winner} 수령 확인
              </span>
            </label>
          </div>
        </div>
      )}

      {/* 삭제 버튼 (모든 상태에서 표시) */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onDelete(mission)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800"
        >
          <Trash2 size={12} /> 삭제
        </button>
      </div>
    </div>
  );
};
