// 보드 — 3라인 × (내 필드[왼쪽] | 라인 정보 | 상대 필드[오른쪽]).
// 먼저 놓은 주사위가 안쪽(중앙)에 오도록 배치. 클릭 타겟 하이라이트 + 실시간 합·승패.
import { canPush, isFieldFull, lineResult } from '../engine';
import type { Die, DieValue, GameState, LineIndex, Owner, ShieldPlacement } from '../types';
import type { PushFx } from '../useTikatuka';
import { DiePip } from './DiePip';

const MAX = 3;
const LINE_NAMES = ['1번 라인', '2번 라인', '3번 라인'];
// 주사위 크기 — 화면 폭에 따라 줄어들도록 clamp(모바일에서 3개+3개가 한 줄에 들어오게).
const DIE_SIZE = 'w-[clamp(26px,8vw,38px)] h-[clamp(26px,8vw,38px)]';

interface Props {
  state: GameState;
  flingIds: string[]; // 밀어내기로 부서지는 중인 주사위 id
  pushFx: PushFx | null; // 밀어내기 충돌(들이받는 공격 주사위) 연출
  aiShieldTarget: ShieldPlacement | null; // AI가 쉴드 둘 칸(고민 중 강조)
  onPlace: (line: LineIndex) => void;
  onPush: (line: LineIndex) => void;
  onPlaceShield: (line: LineIndex, owner: Owner) => void;
}

// 공격 주사위가 victim 칸으로 파고드는 방향(victim이 ai면 내 쪽 왼쪽→오른쪽, me면 상대 쪽 오른쪽→왼쪽).
interface Ram {
  value: DieValue;
  attacker: Owner;
  dir: 'left' | 'right';
}

// 들이받는 ram 한 개가 떨어질 슬롯 = 공격 방향에서 가장 가까운 피해 주사위.
// dir 'right'(왼→오)면 가장 왼쪽 피해자, 'left'(오→왼)면 가장 오른쪽 피해자.
function ramSlot(slots: (Die | null)[], flingIds: string[], dir: 'left' | 'right'): number {
  const hits = slots.map((d, i) => (d != null && flingIds.includes(d.id) ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 0) return -1;
  return dir === 'right' ? hits[0] : hits[hits.length - 1];
}

// 필드를 디스플레이 슬롯 배열로. innerSide='right'면 먼저 놓은 d0이 오른쪽(안쪽).
function toSlots(field: Die[], innerSide: 'left' | 'right'): (Die | null)[] {
  const ordered: (Die | null)[] = Array.from({ length: MAX }, (_, i) => field[i] ?? null);
  // ordered = [d0, d1, d2]. innerSide right면 d0이 맨 오른쪽에 오도록 뒤집는다.
  return innerSide === 'right' ? ordered.reverse() : ordered;
}

export function Board({ state, flingIds, pushFx, aiShieldTarget, onPlace, onPush, onPlaceShield }: Props) {
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

        // 이 라인에서 밀어내기 충돌 중이면, 피해자 칸에 들이받는 공격 주사위를 띄운다.
        const ramHere = pushFx?.line === line ? pushFx : null;
        const myRam: Ram | null =
          ramHere?.victim === 'me' ? { value: ramHere.value, attacker: 'ai', dir: 'left' } : null;
        const aiRam: Ram | null =
          ramHere?.victim === 'ai' ? { value: ramHere.value, attacker: 'me', dir: 'right' } : null;

        // AI가 쉴드 둘 칸 고민 중 — 해당 칸을 강조(클릭 불가).
        const aiShieldMy = aiShieldTarget?.line === line && aiShieldTarget.owner === 'me';
        const aiShieldAi = aiShieldTarget?.line === line && aiShieldTarget.owner === 'ai';

        return (
          <div
            key={line}
            className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/40 sm:gap-2 sm:p-2"
          >
            {/* 내 필드 (왼쪽) — 안쪽=오른쪽. 배치/쉴드 배치 타겟 */}
            <FieldBox
              slots={toSlots(myField, 'right')}
              justify="end"
              flingIds={flingIds}
              ram={myRam}
              highlight={canPlaceHere ? 'place' : shieldMy || aiShieldMy ? 'shield' : null}
              onClick={
                canPlaceHere ? () => onPlace(line) : shieldMy ? () => onPlaceShield(line, 'me') : undefined
              }
            />

            {/* 라인 정보 — 나(왼쪽) : 상대(오른쪽) */}
            <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 sm:min-w-[84px] sm:px-1">
              <span className="hidden text-[10px] font-bold text-zinc-400 sm:block">{LINE_NAMES[line]}</span>
              <span className="text-[10px] font-bold text-zinc-400 sm:hidden">{line + 1}라인</span>
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
              flingIds={flingIds}
              ram={aiRam}
              highlight={canPushHere ? 'push' : shieldAi || aiShieldAi ? 'shield' : null}
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
  flingIds,
  ram,
  highlight,
  onClick,
}: {
  slots: (Die | null)[];
  justify: 'start' | 'end';
  flingIds: string[];
  ram?: Ram | null;
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
      className={`relative flex touch-manipulation select-none items-center gap-1 rounded-xl p-1 transition-colors sm:gap-1.5 sm:p-1.5 ${justify === 'end' ? 'justify-end' : 'justify-start'} ${ring} disabled:cursor-default`}
    >
      {slots.map((d, i) => {
        const flinging = d != null && flingIds.includes(d.id);
        // 부서지는 주사위는 충돌 지점 바깥(나=왼쪽, 상대=오른쪽)으로 넉백. z-30으로 띄워 이웃 주사위 뒤로 깔리지 않게.
        const anim = d == null ? '' : flinging ? 'relative z-30 tk-shatter' : d.shield ? 'tk-shield-in' : 'tk-pop';
        return (
          <DiePip
            key={d?.id ?? `e${i}`}
            die={d}
            className={`${DIE_SIZE} ${anim}`}
            style={
              flinging
                ? ({ '--tk-kx': d!.owner === 'me' ? '-7px' : '7px' } as React.CSSProperties)
                : undefined
            }
          />
        );
      })}

      {/* 들이받는 공격 주사위 — 굴린 주사위는 '하나'다. 같은 값이 여러 개 밀려나도 ram은 한 개만,
          공격 방향에서 가장 가까운 피해 주사위 자리로 날아와 부딪히고(나머지는 그 충격으로 함께 부서짐).
          slots 레이아웃을 그대로 미러링(같은 gap·padding·justify)해 그 자리에 정확히 겹친다. */}
      {ram && (
        <span
          className={`pointer-events-none absolute inset-0 z-40 flex items-center gap-1 p-1 sm:gap-1.5 sm:p-1.5 ${justify === 'end' ? 'justify-end' : 'justify-start'}`}
        >
          {slots.map((d, i) => {
            const isRam = i === ramSlot(slots, flingIds, ram.dir);
            if (!isRam) return <span key={`r${i}`} className={DIE_SIZE} />;
            return (
              <span key={`r${i}`} className={`relative flex ${DIE_SIZE} items-center justify-center`}>
                {/* 충돌 섬광 */}
                <span className="tk-impact absolute inset-0 rounded-full bg-amber-300/60 blur-[3px]" />
                <DiePip
                  die={{ id: 'ram', value: ram.value, owner: ram.attacker, shield: false }}
                  className={`${DIE_SIZE} ${ram.dir === 'right' ? 'tk-ram-right' : 'tk-ram-left'}`}
                />
              </span>
            );
          })}
        </span>
      )}
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
