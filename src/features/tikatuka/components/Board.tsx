// 보드 — 3라인 × (내 필드[왼쪽] | 라인 정보 | 상대 필드[오른쪽]).
// 먼저 놓은 주사위가 안쪽(중앙)에 오도록 배치. 클릭 타겟 하이라이트 + 실시간 합·승패.
import { canPush, isFieldFull, lineResult } from '../engine';
import type { Die, GameState, LineIndex, Owner } from '../types';
import { DiePip } from './DiePip';

const MAX = 3;
const LINE_NAMES = ['1번 라인', '2번 라인', '3번 라인'];

interface Props {
  state: GameState;
  onPlace: (line: LineIndex) => void;
  onPush: (line: LineIndex) => void;
  onPlaceShield: (line: LineIndex, owner: Owner) => void;
}

// 필드를 디스플레이 슬롯 배열로. innerSide='right'면 먼저 놓은 d0이 오른쪽(안쪽).
function toSlots(field: Die[], innerSide: 'left' | 'right'): (Die | null)[] {
  const ordered: (Die | null)[] = Array.from({ length: MAX }, (_, i) => field[i] ?? null);
  // ordered = [d0, d1, d2]. innerSide right면 d0이 맨 오른쪽에 오도록 뒤집는다.
  return innerSide === 'right' ? ordered.reverse() : ordered;
}

export function Board({ state, onPlace, onPush, onPlaceShield }: Props) {
  const myTurn = state.turn === 'me' && state.winner === null;
  const acting = myTurn && state.phase === 'acting' && !!state.rolledDie;
  const placingShield = myTurn && state.phase === 'placingShield' && !!state.pendingShield;
  const rolledValue = state.rolledDie?.value;

  const lines: LineIndex[] = [0, 1, 2];

  return (
    <div className="flex flex-col gap-2.5">
      {/* 진영 헤더 — 나(왼쪽) / 상대(오른쪽) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-xs font-bold">
        <span className="text-indigo-600 dark:text-indigo-400">나</span>
        <span className="text-zinc-400">VS</span>
        <span className="text-right text-rose-600 dark:text-rose-400">상대 (컴퓨터)</span>
      </div>

      {lines.map((line) => {
        const lr = lineResult(state.board, line);
        const myField = state.board.lines[line].me;
        const aiField = state.board.lines[line].ai;

        // 매칭되면 밀어내기 강제(그 라인엔 배치 불가)
        const canPushHere = acting && rolledValue != null && canPush(state.board, line, 'me', rolledValue);
        const canPlaceHere = acting && !canPushHere && !isFieldFull(state.board, line, 'me');
        const shieldMy = placingShield && !isFieldFull(state.board, line, 'me');
        const shieldAi = placingShield && !isFieldFull(state.board, line, 'ai');

        return (
          <div
            key={line}
            className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-2 dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            {/* 내 필드 (왼쪽) — 안쪽=오른쪽. 배치/쉴드 배치 타겟 */}
            <FieldBox
              slots={toSlots(myField, 'right')}
              justify="end"
              highlight={canPlaceHere ? 'place' : shieldMy ? 'shield' : null}
              onClick={
                canPlaceHere ? () => onPlace(line) : shieldMy ? () => onPlaceShield(line, 'me') : undefined
              }
            />

            {/* 라인 정보 — 나(왼쪽) : 상대(오른쪽) */}
            <div className="flex min-w-[84px] flex-col items-center justify-center gap-0.5 px-1">
              <span className="text-[10px] font-bold text-zinc-400">{LINE_NAMES[line]}</span>
              <span className="text-sm font-bold tabular-nums">
                <span className="text-indigo-500">{lr.meSum}</span>
                <span className="mx-1 text-zinc-300">:</span>
                <span className="text-rose-500">{lr.aiSum}</span>
              </span>
              <LineBadge winner={lr.winner} />
            </div>

            {/* 상대 필드 (오른쪽) — 안쪽=왼쪽. 밀어내기/쉴드 배치 타겟 */}
            <FieldBox
              slots={toSlots(aiField, 'left')}
              justify="start"
              highlight={canPushHere ? 'push' : shieldAi ? 'shield' : null}
              onClick={
                canPushHere ? () => onPush(line) : shieldAi ? () => onPlaceShield(line, 'ai') : undefined
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function FieldBox({
  slots,
  justify,
  highlight,
  onClick,
}: {
  slots: (Die | null)[];
  justify: 'start' | 'end';
  highlight: 'place' | 'push' | 'shield' | null;
  onClick?: () => void;
}) {
  const ring =
    highlight === 'place'
      ? 'ring-2 ring-indigo-400 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
      : highlight === 'push'
        ? 'ring-2 ring-rose-400 cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/30'
        : highlight === 'shield'
          ? 'ring-2 ring-amber-400 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30'
          : '';
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl p-1.5 transition-colors ${justify === 'end' ? 'justify-end' : 'justify-start'} ${ring} disabled:cursor-default`}
    >
      {slots.map((d, i) => (
        <DiePip key={d?.id ?? `e${i}`} die={d} size={38} />
      ))}
    </button>
  );
}

function LineBadge({ winner }: { winner: Owner | 'tie' }) {
  const meta =
    winner === 'me'
      ? { t: '내 승', c: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' }
      : winner === 'ai'
        ? { t: '상대 승', c: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' }
        : { t: '무', c: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.c}`}>{meta.t}</span>;
}
