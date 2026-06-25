// 티카투카 시뮬 — 실전 인게임 보조. 사용자가 보드(3x3 내/상대)와 굴린 주사위를 수동 입력하면
// 게임과 같은 추천 엔진(끝까지 시뮬 MC)이 최선 수 + 근거를 보여준다. (상대 주사위 굴림 입력은 불필요)
import { useState, useEffect } from 'react';
import { Info, RotateCcw, ShieldCheck, Check, Trash2 } from 'lucide-react';
import { createEmptyBoard, lineSum, makeDie } from './engine';
import {
  recommendMove,
  recommendShield,
  recommendFirstShield,
  recommendChoose,
  recommendHold,
  estimateWinRate,
} from './ai';
import type { Factor } from './ai';
import type { Board, Die, DieValue, LineIndex, Owner } from './types';
import { DiePip } from './components/DiePip';
import { AdvicePanel, WinRateBar } from './components/AdvicePanel';

const LINES: LineIndex[] = [0, 1, 2];
const SLOTS = [0, 1, 2];
const VALUES: DieValue[] = [1, 2, 3, 4, 5, 6];
const STORE_KEY = 'tikatukaSim_v2';
// 보드 주사위 크기 — 모바일 clamp, PC 큼직.
const DIE = 'h-[clamp(34px,9vw,44px)] w-[clamp(34px,9vw,44px)] lg:h-14 lg:w-14';

type Mode = 'normal' | 'shield' | 'pick';
// 칸 한 개 — 비었으면 null, 채워졌으면 값+쉴드.
type Cell = { value: DieValue; shield: boolean } | null;
type Grid = { me: Cell[]; ai: Cell[] }[]; // 3 라인, 각 me/ai = 길이3

interface SimAdvice {
  kind: 'place' | 'push' | 'shield' | 'tazza' | 'choose' | 'hold' | 'none';
  headline: string;
  factors: Factor[];
  isHold?: boolean;
  line?: LineIndex;
  side?: Owner;
  chooseIndex?: 0 | 1;
}

function emptyGrid(): Grid {
  return LINES.map(() => ({ me: [null, null, null], ai: [null, null, null] }));
}
// 시뮬 그리드 → 엔진 보드(빈 칸 제외, 위치 무관 — 점수/추천은 순서 영향 없음).
function gridToBoard(grid: Grid): Board {
  const b = createEmptyBoard();
  LINES.forEach((line) => {
    (['me', 'ai'] as Owner[]).forEach((owner) => {
      grid[line][owner].forEach((cell) => {
        if (cell) b.lines[line][owner].push(makeDie(cell.value, owner, cell.shield));
      });
    });
  });
  return b;
}
function lineSumOf(grid: Grid, line: LineIndex, owner: Owner): number {
  const dice = grid[line][owner].filter((c): c is NonNullable<Cell> => c != null).map((c) => makeDie(c.value, owner, c.shield));
  return lineSum(dice);
}
// 같은 값(묶음)을 안쪽으로, 단일은 바깥쪽으로 정렬한 주사위 배열(값 크기 정렬은 안 함 — 첫 등장 순서 유지).
function groupSorted(dice: NonNullable<Cell>[], owner: Owner): NonNullable<Cell>[] {
  const count = new Map<number, number>();
  const firstOcc = new Map<number, number>();
  dice.forEach((d, i) => {
    count.set(d.value, (count.get(d.value) ?? 0) + 1);
    if (!firstOcc.has(d.value)) firstOcc.set(d.value, i);
  });
  return [...dice].sort((x, y) => {
    const gx = count.get(x.value)! >= 2 ? 1 : 0;
    const gy = count.get(y.value)! >= 2 ? 1 : 0;
    if (gx !== gy) return owner === 'me' ? gx - gy : gy - gx; // me: 묶음 오른쪽(안쪽), ai: 묶음 왼쪽(안쪽)
    return firstOcc.get(x.value)! - firstOcc.get(y.value)!;
  });
}
const pack = (dice: NonNullable<Cell>[], owner: Owner): Cell[] => {
  const pad: Cell[] = Array(3 - dice.length).fill(null);
  return owner === 'me' ? [...pad, ...dice] : [...dice, ...pad];
};
// 수동 칸 입력용 — 같은 값이 있을 때만 묶고, 없으면 위치 그대로(서로 다른 값 수동 배치 보존).
function arrange(cells: Cell[], owner: Owner): Cell[] {
  const dice = cells.filter((c): c is NonNullable<Cell> => c != null);
  const count = new Map<number, number>();
  dice.forEach((d) => count.set(d.value, (count.get(d.value) ?? 0) + 1));
  if (![...count.values()].some((n) => n >= 2)) return cells; // 중복 없음 → 위치 그대로
  return pack(groupSorted(dice, owner), owner);
}
// 자동 적용·제거(지우기·밀어내기)용 — 항상 안쪽으로 압축(순서 유지 + 같은 값 묶음).
function compactInner(cells: Cell[], owner: Owner): Cell[] {
  return pack(groupSorted(cells.filter((c): c is NonNullable<Cell> => c != null), owner), owner);
}

function loadStore(): { grid: Grid; tazza: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && Array.isArray(p.grid) && p.grid.length === 3) return p;
  } catch {
    /* 무시 */
  }
  return null;
}

export function TikatukaSim() {
  const initial = loadStore();
  const [grid, setGrid] = useState<Grid>(() => initial?.grid ?? emptyGrid());
  const [tazza, setTazza] = useState<boolean>(() => initial?.tazza ?? true);
  const [mode, setMode] = useState<Mode>('normal');
  const [v1, setV1] = useState<DieValue | null>(null);
  const [v2, setV2] = useState<DieValue | null>(null);
  // 칸 편집 picker.
  const [editing, setEditing] = useState<{ line: LineIndex; owner: Owner; slot: number } | null>(null);
  const [editShield, setEditShield] = useState(false);
  // 추천(비동기).
  const [advice, setAdvice] = useState<SimAdvice | null>(null);
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [winRate, setWinRate] = useState<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ grid, tazza }));
    } catch {
      /* 무시 */
    }
  }, [grid, tazza]);

  // 추천 — 무거운 MC라 페인트 후 비동기로(렌더 차단 방지).
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      if (!alive) return;
      const board = gridToBoard(grid);
      setAdvice(computeSimAdvice(board, mode, v1, v2, tazza));
      setWinRate(estimateWinRate(board, 'me'));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [grid, mode, v1, v2, tazza]);

  const resetRolled = () => {
    setV1(null);
    setV2(null);
  };

  // 칸 직접 설정 — 같은 값 있으면 묶음 정렬, 없으면 위치 그대로(수동 배치 보존).
  const setCell = (line: LineIndex, owner: Owner, slot: number, cell: Cell) => {
    setGrid((g) =>
      g.map((ln, li) =>
        li !== line ? ln : { ...ln, [owner]: arrange(ln[owner].map((c, si) => (si === slot ? cell : c)), owner) }
      )
    );
  };
  const setField = (line: LineIndex, owner: Owner, cells: Cell[]) => {
    setGrid((g) => g.map((ln, li) => (li !== line ? ln : { ...ln, [owner]: cells })));
  };
  // 자동 적용 — 추가 후 항상 안쪽으로 압축(+같은 값 묶음).
  const addToLine = (line: LineIndex, owner: Owner, value: DieValue, shield: boolean) => {
    setGrid((g) =>
      g.map((ln, li) => {
        if (li !== line) return ln;
        if (ln[owner].filter((c) => c != null).length >= 3) return ln;
        return { ...ln, [owner]: compactInner([...ln[owner], { value, shield }], owner) };
      })
    );
  };

  const openEdit = (line: LineIndex, owner: Owner, slot: number) => {
    setEditing({ line, owner, slot });
    setEditShield(grid[line][owner][slot]?.shield ?? false);
  };

  // 추천대로 자동 적용.
  const applyAdvice = () => {
    if (!advice) return;
    if (advice.kind === 'place' && advice.line != null && v1 != null) {
      addToLine(advice.line, 'me', v1, false);
      resetRolled();
    } else if (advice.kind === 'push' && advice.line != null && v1 != null) {
      // 상대 매칭(비쉴드) 제거 후, 받은 쉴드 값 입력 유도.
      setGrid((g) =>
        g.map((ln, li) =>
          li !== advice.line
            ? ln
            : { ...ln, ai: compactInner(ln.ai.map((c) => (c && !c.shield && c.value === v1 ? null : c)), 'ai') }
        )
      );
      setMode('shield');
      resetRolled();
    } else if (advice.kind === 'shield' && advice.line != null && advice.side != null && v1 != null) {
      addToLine(advice.line, advice.side, v1, true);
      setMode('normal'); // 쉴드 배치 후 바로 일반 모드로.
      resetRolled();
    } else if (advice.kind === 'choose' && advice.chooseIndex != null) {
      const chosen = advice.chooseIndex === 0 ? v1 : v2;
      setMode('normal');
      setV1(chosen);
      setV2(null);
      setTazza(false); // 타짜 택1을 적용했으니 보유 타짜 소진.
    }
  };

  const canApply =
    advice != null &&
    (advice.kind === 'place' || advice.kind === 'push' || advice.kind === 'shield' || advice.kind === 'choose');

  return (
    <div className="flex flex-col gap-4">
      {/* 사용법 */}
      <div className="flex gap-2 rounded-xl bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-900/80 dark:bg-indigo-950/30 dark:text-indigo-200/80 lg:text-sm">
        <Info size={16} className="mt-0.5 shrink-0 text-indigo-500" />
        <span>
          인게임 보드를 그대로 입력하세요. 각 칸(3×3 내 필드 / 3×3 상대 필드)을 탭해 값과 <b>쉴드</b>를 지정하고,
          아래에 <b>지금 내가 처리할 주사위</b>(일반/쉴드/타짜 택1)와 <b>타짜 보유</b>를 고르면 최선 수를 추천해요.
          상대가 둔 결과는 상대 필드에 반영만 하면 됩니다. (상대 굴림 입력 불필요)
        </span>
      </div>

      {/* 예상 승률 */}
      {winRate != null && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
          <span className="shrink-0 text-xs font-bold text-zinc-500 dark:text-zinc-400 lg:text-sm">예상 승률</span>
          <WinRateBar winRate={winRate} />
        </div>
      )}

      {/* 편집 보드 */}
      <div className="flex flex-col gap-2.5 lg:gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-xs font-bold lg:text-base">
          <span className="text-indigo-600 dark:text-indigo-400">내 필드</span>
          <span className="text-zinc-400">VS</span>
          <span className="text-right text-rose-600 dark:text-rose-400">상대 필드</span>
        </div>

        {LINES.map((line) => {
          const meSum = lineSumOf(grid, line, 'me');
          const aiSum = lineSumOf(grid, line, 'ai');
          const winner: Owner | 'tie' = meSum > aiSum ? 'me' : aiSum > meSum ? 'ai' : 'tie';
          return (
            <div
              key={line}
              className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/40 sm:gap-2 sm:p-2 lg:gap-3 lg:p-3"
            >
              <FieldCells
                cells={grid[line].me}
                owner="me"
                editingSlot={editing?.line === line && editing.owner === 'me' ? editing.slot : null}
                advice={advice?.line === line && advice.side === 'me'}
                onTap={(slot) => openEdit(line, 'me', slot)}
              />
              <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 lg:min-w-[110px] lg:gap-1">
                <span className="text-[10px] font-bold text-zinc-400 lg:text-sm">{line + 1}번</span>
                <span className="font-bold tabular-nums lg:text-2xl">
                  <span className="text-indigo-500">{meSum}</span>
                  <span className="mx-1 text-zinc-300">:</span>
                  <span className="text-rose-500">{aiSum}</span>
                </span>
                <LineBadge winner={winner} />
              </div>
              <FieldCells
                cells={grid[line].ai}
                owner="ai"
                editingSlot={editing?.line === line && editing.owner === 'ai' ? editing.slot : null}
                advice={advice?.line === line && advice.side === 'ai'}
                onTap={(slot) => openEdit(line, 'ai', slot)}
              />
            </div>
          );
        })}
      </div>

      {/* 칸 편집 picker */}
      {editing && (
        <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-800/60 dark:bg-indigo-950/30">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
              {editing.line + 1}번 라인 {editing.owner === 'me' ? '내' : '상대'} 필드 · {editing.slot + 1}번 칸
            </span>
            <button onClick={() => setEditing(null)} className="text-xs font-bold text-zinc-400 hover:text-zinc-600">
              닫기
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const next = !editShield;
                setEditShield(next);
                const cur = grid[editing.line][editing.owner][editing.slot];
                if (cur) setCell(editing.line, editing.owner, editing.slot, { ...cur, shield: next });
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
                editShield ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
              }`}
            >
              <ShieldCheck size={16} /> 쉴드 {editShield ? 'ON' : 'OFF'}
            </button>
            {VALUES.map((v) => {
              const cur = grid[editing.line][editing.owner][editing.slot];
              const sel = cur?.value === v;
              return (
                <button
                  key={v}
                  onClick={() => {
                    setCell(editing.line, editing.owner, editing.slot, { value: v, shield: editShield });
                    setEditing(null);
                  }}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border text-base font-bold transition-colors lg:h-12 lg:w-12 lg:text-lg ${
                    sel
                      ? 'border-indigo-500 bg-indigo-500 text-white'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                  }`}
                >
                  {v}
                </button>
              );
            })}
            <button
              onClick={() => {
                const cleared = grid[editing.line][editing.owner].map((c, si) => (si === editing.slot ? null : c));
                setField(editing.line, editing.owner, compactInner(cleared, editing.owner));
                setEditing(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              <Trash2 size={16} /> 지우기
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">쉴드면 먼저 쉴드 ON 후 값을 누르세요. 값을 누르면 칸이 채워져요.</p>
        </div>
      )}

      {/* 내 주사위 입력 */}
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50 lg:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300 lg:text-base">내 주사위</span>
          <Segmented
            options={[
              { key: 'normal', label: '일반' },
              { key: 'shield', label: '쉴드' },
              { key: 'pick', label: '타짜 택1' },
            ]}
            value={mode}
            onChange={(k) => {
              setMode(k as Mode);
              resetRolled();
            }}
          />
          <button
            onClick={() => setTazza((t) => !t)}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              tazza ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
            }`}
          >
            타짜 보유 {tazza ? 'O' : 'X'}
          </button>
        </div>

        {mode === 'pick' ? (
          <div className="flex flex-col gap-2">
            <ValueRow label="첫 눈" value={v1} onPick={setV1} />
            <ValueRow label="둘째 눈" value={v2} onPick={setV2} />
          </div>
        ) : (
          <ValueRow label={mode === 'shield' ? '쉴드 값' : '굴린 값'} value={v1} onPick={setV1} />
        )}
      </div>

      {/* 추천 */}
      {advice && advice.kind !== 'none' && (
        <div className="flex flex-col gap-2">
          <AdvicePanel
            headline={advice.headline}
            factors={advice.factors}
            isHold={advice.isHold}
            open={adviceOpen}
            onToggle={() => setAdviceOpen((v) => !v)}
          />
          {canApply && (
            <button
              onClick={applyAdvice}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 lg:py-3 lg:text-base"
            >
              <Check size={16} /> 이대로 두기 (보드에 반영)
            </button>
          )}
        </div>
      )}
      {advice && advice.kind === 'none' && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
          {advice.headline}
        </div>
      )}

      {/* 컨트롤 */}
      <button
        onClick={() => {
          setGrid(emptyGrid());
          resetRolled();
          setEditing(null);
          setTazza(true);
        }}
        className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        <RotateCcw size={15} /> 보드 초기화
      </button>
    </div>
  );
}

// ── 추천 계산(게임 computeAdvice와 동일 우선순위) ──
function computeSimAdvice(
  board: Board,
  mode: Mode,
  v1: DieValue | null,
  v2: DieValue | null,
  tazza: boolean
): SimAdvice | null {
  const hold = recommendHold(board, 'me');
  if (hold) return { kind: 'hold', headline: hold.headline, factors: hold.factors, isHold: true };

  if (mode === 'pick') {
    if (v1 == null || v2 == null) return null;
    const a = recommendChoose(board, 'me', [v1, v2]);
    return { kind: 'choose', headline: a.headline, factors: a.factors, chooseIndex: a.index };
  }
  if (mode === 'shield') {
    if (v1 == null) return null;
    const empty = board.lines.every((l) => l.me.length === 0 && l.ai.length === 0);
    const a = empty ? recommendFirstShield(board, 'me', v1, tazza) : recommendShield(board, 'me', v1);
    if (!a) return { kind: 'none', headline: '쉴드를 둘 칸이 없어요(모든 필드 가득).', factors: [] };
    return { kind: 'shield', headline: a.headline, factors: a.factors, line: a.line, side: a.owner };
  }
  if (v1 == null) return null;
  const a = recommendMove(board, 'me', v1, tazza);
  if (!a) return { kind: 'none', headline: '둘 곳·밀 곳이 없어요 — 패스/홀드 상황.', factors: [] };
  return {
    kind: a.action,
    headline: a.headline,
    factors: a.factors,
    line: a.line,
    side: a.action === 'push' ? 'ai' : a.action === 'place' ? 'me' : undefined,
  };
}

// ── 한 필드(3 칸) — 항상 3칸 표시, 각 칸 탭해서 편집 ──
function FieldCells({
  cells,
  owner,
  editingSlot,
  advice,
  onTap,
}: {
  cells: Cell[];
  owner: Owner;
  editingSlot: number | null;
  advice?: boolean;
  onTap: (slot: number) => void;
}) {
  const ring = advice ? 'ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : '';
  return (
    <div
      className={`relative flex items-center gap-1 rounded-xl p-1 sm:gap-1.5 sm:p-1.5 ${owner === 'me' ? 'justify-end' : 'justify-start'} ${ring}`}
    >
      {advice && (
        <span className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold text-white shadow">
          추천
        </span>
      )}
      {SLOTS.map((i) => {
        const cell = cells[i];
        const die: Die | null = cell ? makeDie(cell.value, owner, cell.shield) : null;
        const editing = editingSlot === i;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onTap(i)}
            title="탭해서 값/쉴드 지정"
            className={`touch-manipulation rounded-lg ${editing ? 'ring-2 ring-indigo-400' : ''}`}
          >
            {die ? (
              <DiePip die={die} className={DIE} />
            ) : (
              <span className={`block rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 ${DIE}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ValueRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: DieValue | null;
  onPick: (v: DieValue) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs font-bold text-zinc-500 lg:text-sm">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {VALUES.map((v) => (
          <button
            key={v}
            onClick={() => onPick(v)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border text-base font-bold transition-colors lg:h-12 lg:w-12 lg:text-lg ${
              value === v
                ? 'border-indigo-500 bg-indigo-500 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400 hover:bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors lg:text-sm ${
            value === o.key
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-700 dark:text-indigo-300'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
