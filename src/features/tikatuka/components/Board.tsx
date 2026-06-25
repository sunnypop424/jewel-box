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
// PC(큰) 크기 — 양옆 트레이 가로 배치에서 큼직하게.
const DIE_SIZE_LG = 'w-[clamp(48px,4vw,64px)] h-[clamp(48px,4vw,64px)]';

interface Props {
  state: GameState;
  flingIds: string[]; // 밀어내기로 부서지는 중인 주사위 id
  pushFx: PushFx | null; // 밀어내기 충돌(들이받는 공격 주사위) 연출
  aiShieldTarget: ShieldPlacement | null; // AI가 쉴드 둘 칸(고민 중 강조)
  adviceTarget: { line: LineIndex; side: Owner } | null; // 지원 모드 추천 강조 칸
  size?: 'lg'; // 'lg'면 PC용 큰 크기
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

export function Board({ state, flingIds, pushFx, aiShieldTarget, adviceTarget, size, onPlace, onPush, onPlaceShield }: Props) {
  const myTurn = state.turn === 'me' && state.winner === null;
  const acting = myTurn && state.phase === 'acting' && !!state.rolledDie;
  const placingShield = myTurn && state.phase === 'placingShield' && !!state.pendingShield;
  const rolledValue = state.rolledDie?.value;
  const lg = size === 'lg';
  const dieSize = lg ? DIE_SIZE_LG : DIE_SIZE;

  const lines: LineIndex[] = [0, 1, 2];

  return (
    <div className={`flex flex-col ${lg ? 'gap-4' : 'gap-2.5'}`}>
      {/* 진영 헤더 — 나(왼쪽) / 상대(오른쪽). PC는 상단바가 표시하므로 생략(중복 방지). */}
      {!lg && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-xs font-bold">
          <span className="text-indigo-600 dark:text-indigo-400">나</span>
          <span className="text-zinc-400">VS</span>
          <span className="text-right text-rose-600 dark:text-rose-400">상대 (컴퓨터)</span>
        </div>
      )}

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

        // 지원 모드 추천 칸 강조.
        const adviceMy = adviceTarget?.line === line && adviceTarget.side === 'me';
        const adviceAi = adviceTarget?.line === line && adviceTarget.side === 'ai';

        return (
          <div
            key={line}
            className={`grid grid-cols-[1fr_auto_1fr] items-stretch rounded-2xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40 ${lg ? 'gap-3 p-3' : 'gap-1 p-1.5 sm:gap-2 sm:p-2'}`}
          >
            {/* 내 필드 (왼쪽) — 안쪽=오른쪽. 배치/쉴드 배치 타겟 */}
            <FieldBox
              slots={toSlots(myField, 'right')}
              justify="end"
              dieSize={dieSize}
              flingIds={flingIds}
              ram={myRam}
              highlight={canPlaceHere ? 'place' : shieldMy || aiShieldMy ? 'shield' : null}
              advice={adviceMy}
              onClick={
                canPlaceHere ? () => onPlace(line) : shieldMy ? () => onPlaceShield(line, 'me') : undefined
              }
            />

            {/* 라인 정보 — 나(왼쪽) : 상대(오른쪽) */}
            <div className={`flex min-w-0 flex-col items-center justify-center gap-0.5 ${lg ? 'min-w-[120px] gap-1 px-2' : 'px-0.5 sm:min-w-[84px] sm:px-1'}`}>
              <span className={`hidden font-bold text-zinc-400 sm:block ${lg ? 'text-sm' : 'text-[10px]'}`}>{LINE_NAMES[line]}</span>
              <span className="text-[10px] font-bold text-zinc-400 sm:hidden">{line + 1}라인</span>
              <span className={`font-bold tabular-nums ${lg ? 'text-2xl' : 'text-sm'}`}>
                <span className="text-indigo-500">{lr.meSum}</span>
                <span className="mx-1 text-zinc-300">:</span>
                <span className="text-rose-500">{lr.aiSum}</span>
              </span>
              <LineBadge winner={lr.winner} lg={lg} />
            </div>

            {/* 상대 필드 (오른쪽) — 안쪽=왼쪽. 밀어내기/쉴드 배치 타겟 */}
            <FieldBox
              slots={toSlots(aiField, 'left')}
              justify="start"
              dieSize={dieSize}
              flingIds={flingIds}
              ram={aiRam}
              highlight={canPushHere ? 'push' : shieldAi || aiShieldAi ? 'shield' : null}
              advice={adviceAi}
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
  dieSize,
  flingIds,
  ram,
  highlight,
  advice,
  onClick,
}: {
  slots: (Die | null)[];
  justify: 'start' | 'end';
  dieSize: string;
  flingIds: string[];
  ram?: Ram | null;
  highlight: 'place' | 'push' | 'shield' | null;
  advice?: boolean;
  onClick?: () => void;
}) {
  // 추천 칸이면 place/push 색 대신 에메랄드 링+배경 하나로(중복 테두리 방지, 지원 텍스트와 같은 계열).
  const ring = advice
    ? 'ring-2 ring-emerald-400 bg-emerald-50 cursor-pointer hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/30'
    : highlight === 'place'
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
      {/* 지원 모드 추천 강조 — '추천' 칩(링/배경은 위 ring으로 처리) */}
      {advice && (
        <span className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold text-white shadow">
          추천
        </span>
      )}
      {slots.map((d, i) => {
        const flinging = d != null && flingIds.includes(d.id);
        // 부서지는 주사위는 충돌 지점 바깥(나=왼쪽, 상대=오른쪽)으로 넉백. z-30으로 띄워 이웃 주사위 뒤로 깔리지 않게.
        const anim = d == null ? '' : flinging ? 'relative z-30 tk-shatter' : d.shield ? 'tk-shield-in' : 'tk-pop';
        return (
          <DiePip
            key={d?.id ?? `e${i}`}
            die={d}
            className={`${dieSize} ${anim}`}
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
          {slots.map((_d, i) => {
            const isRam = i === ramSlot(slots, flingIds, ram.dir);
            if (!isRam) return <span key={`r${i}`} className={dieSize} />;
            return (
              <span key={`r${i}`} className={`relative flex ${dieSize} items-center justify-center`}>
                {/* 충돌 섬광 */}
                <span className="tk-impact absolute inset-0 rounded-full bg-amber-300/60 blur-[3px]" />
                <DiePip
                  die={{ id: 'ram', value: ram.value, owner: ram.attacker, shield: false }}
                  className={`${dieSize} ${ram.dir === 'right' ? 'tk-ram-right' : 'tk-ram-left'}`}
                />
              </span>
            );
          })}
        </span>
      )}
    </button>
  );
}

function LineBadge({ winner, lg }: { winner: Owner | 'tie'; lg?: boolean }) {
  const meta =
    winner === 'me'
      ? { t: '내 승', c: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' }
      : winner === 'ai'
        ? { t: '상대 승', c: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' }
        : { t: '무', c: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' };
  return <span className={`rounded-full font-bold ${lg ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'} ${meta.c}`}>{meta.t}</span>;
}
