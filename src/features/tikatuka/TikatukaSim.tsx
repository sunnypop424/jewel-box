// 티카투카 시뮬 — 실전 인게임 보조. 선공부터 턴을 번갈아 잡고, '현재 턴' 기준으로 보드 클릭을 해석한다.
//  · 내 턴: 내 필드 클릭 = 놓기 / 상대 필드 클릭 = 알까기. 상대 턴: 상대 필드 = 놓기 / 내 필드 = 알까기.
//  · 알까기는 미는 쪽(현재 턴)의 그 라인 필드가 꽉 차면 불가(필드잠금). 불가능한 칸은 비활성화.
//  · 알까기 성공 → 미는 쪽이 쉴드 1개 획득. 값을 입력하면(내 쉴드면 추천 칸 강조) 칸 클릭해 배치(어느 필드든).
//  · 선공측의 '첫 주사위'는 쉴드로 자동. 행동을 마치면 턴이 자동으로 넘어간다(필요 시 수동 전환).
//  · 타짜: 두 눈을 입력하면 어느 쪽이 좋은지 추천 → 선택하면 그 값으로 진행(게임당 1회 소진).
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, RotateCcw, Undo2, ShieldCheck, Flag, Sparkles, X, Loader2, PictureInPicture2, ChevronsLeft, ChevronsRight, Minus, Swords, Lightbulb, Hand } from 'lucide-react';
import { createEmptyBoard, evaluate, lineSum, makeDie, opponentOf } from './engine';
import type { AiLevel, Board, Die, DieValue, LineIndex, Owner } from './types';
import { useAdvisorPool, type AdvReq } from './useAdvisorPool';
import { saveSimGame, fetchAllSimGames, type SimGameLog, type SimMoveEvent, type LogGrid } from './simLog';
import { PIP_SUPPORTED, usePipWindow } from '../../hooks/usePipWindow';
import { DiePip } from './components/DiePip';
import { DiceGroupOverlay } from './components/DiceGroupOverlay';
import { WinRateBar, FactorList } from './components/AdvicePanel';

const LINES: LineIndex[] = [0, 1, 2];
const VALUES: DieValue[] = [1, 2, 3, 4, 5, 6];
const STORE_KEY = 'tikatukaSim_v5';
// 보드 주사위 크기 — 모바일 clamp, PC 큼직.
const DIE = 'h-[clamp(34px,9vw,44px)] w-[clamp(34px,9vw,44px)] lg:h-14 lg:w-14';

// 주사위 한 개(값 + 쉴드 여부 + 소유자). 필드는 '배치 순서' 배열 — [0]이 먼저 놓은 것(가장 안쪽).
// owner = 놓은 쪽. 일반 주사위는 자기 필드 주인과 같지만, 쉴드는 상대 필드에 둘 수 있어 필드와 다를 수 있다
// (예: 내가 알까기로 얻은 쉴드를 상대 필드에 배치 → 필드는 상대지만 owner는 나 → 내 색으로 표시).
type Piece = { value: DieValue; shield: boolean; owner: Owner };
type Field = Piece[];
type Grid = { me: Field; ai: Field }[]; // 3 라인
// 알까기 직후 획득한 쉴드 배치 대기 — pusher가 얻은 쪽, value는 사용자가 입력(실게임에서 본 난수 값).
type Pending = { pusher: Owner; value: DieValue | null };
// 필드 클릭이 의미하는 동작.
type FieldAct = 'place' | 'push' | 'shield' | null;
// 되돌리기 스냅샷.
type Snap = { grid: Grid; firstShield: Owner | null; turn: Owner; pending: Pending | null };

function emptyGrid(): Grid {
  return LINES.map(() => ({ me: [], ai: [] }));
}
// 시뮬 그리드 → 엔진 보드(배치 순서 그대로). 쉴드 소유자는 점수/추천에 영향 없어 필드 주인으로 만든다.
function gridToBoard(grid: Grid): Board {
  const b = createEmptyBoard();
  LINES.forEach((line) => {
    (['me', 'ai'] as Owner[]).forEach((owner) => {
      grid[line][owner].forEach((p) => b.lines[line][owner].push(makeDie(p.value, owner, p.shield)));
    });
  });
  return b;
}
function fieldSum(field: Field, owner: Owner): number {
  return lineSum(field.map((p) => makeDie(p.value, owner, p.shield)));
}
// 표시 슬롯 — 게임 Board.toSlots와 동일 규칙: 같은 값은 '처음 놓인 순서'로 묶고, 먼저 놓은 게 안쪽.
function displaySlots(field: Field, owner: Owner): (Piece | null)[] {
  const firstOcc = new Map<number, number>();
  field.forEach((p, i) => {
    if (!firstOcc.has(p.value)) firstOcc.set(p.value, i);
  });
  const ordered = [...field].sort((a, b) => firstOcc.get(a.value)! - firstOcc.get(b.value)!);
  const pad: (Piece | null)[] = Array.from({ length: 3 - ordered.length }, () => null);
  return owner === 'me' ? [...pad, ...ordered.reverse()] : [...ordered, ...pad];
}
function addPiece(grid: Grid, line: LineIndex, owner: Owner, p: Piece): Grid {
  return grid.map((ln, i) => (i !== line ? ln : { ...ln, [owner]: [...ln[owner], p] }));
}
function removeMatching(grid: Grid, line: LineIndex, owner: Owner, value: DieValue): Grid {
  return grid.map((ln, i) =>
    i !== line ? ln : { ...ln, [owner]: ln[owner].filter((p) => p.shield || p.value !== value) }
  );
}
// 한 진영의 3개 필드가 모두 가득 — 둘 곳도 없고, 필드잠금으로 알까기도 불가 → 그 턴은 자동 패스 대상.
function allFull(grid: Grid, owner: Owner): boolean {
  return LINES.every((l) => grid[l][owner].length >= 3);
}

function loadStore(): {
  grid: Grid;
  firstTurn: Owner;
  turn: Owner;
  started: boolean;
  firstShield: Owner | null;
  tazza: boolean;
  star?: AiLevel | null;
} | null {
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

// ── 실전 기록(데이터 적재) ──────────────────────────────
// 내가 입력하는 실제 경기(양측 수 전부)를 RTDB에 쌓아 나중에 분석·추천 개선에 쓴다.
const REC_KEY = 'tikatukaSimRec_v1'; // 기록 ON/OFF 보존
// 시뮬 Grid → 로그용 순수 스냅샷(깊은 복사). Piece={value,shield,owner}라 구조 동일.
function cloneGrid(grid: Grid): LogGrid {
  return grid.map((l) => ({ me: l.me.map((p) => ({ ...p })), ai: l.ai.map((p) => ({ ...p })) }));
}
function genGameId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}
function readPlayerName(): string {
  try {
    return localStorage.getItem('tikatuka_name_v1') ?? ''; // 허브에서 설정한 이름
  } catch {
    return '';
  }
}

// PiP 토글 — 페이지에선 '띄우기', PiP 창 안에선 '닫기'로 동작(같은 줄을 포털로 공유).
function PipBar({ pipWindow, onOpen }: { pipWindow: Window | null; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 dark:border-indigo-900/50 dark:bg-indigo-950/20">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 lg:text-xs">
        <PictureInPicture2 size={14} />
        {pipWindow ? 'PiP 오버레이 — 게임 위에 떠 있어요' : '시뮬을 게임 위에 항상 띄우기'}
      </span>
      <button
        onClick={() => (pipWindow ? pipWindow.close() : onOpen())}
        disabled={!PIP_SUPPORTED}
        title={PIP_SUPPORTED ? '' : '이 브라우저는 Document PiP를 지원하지 않아요 (크롬 116+ 필요)'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pipWindow ? 'PiP 닫기' : 'PiP로 띄우기'}
      </button>
    </div>
  );
}

// PiP가 열려 있는 동안 본 페이지에 남기는 안내(시뮬 본체는 PiP 창에 있음).
function PipPlaceholder({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/40 p-8 text-center dark:border-indigo-800/60 dark:bg-indigo-950/20">
      <PictureInPicture2 size={28} className="text-indigo-500" />
      <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">시뮬이 PiP 창에 떠 있어요</p>
      <p className="text-[11px] text-zinc-500">게임을 테두리 없는 창모드로 두면 그 위에 항상 표시됩니다.</p>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        이 창으로 되돌리기
      </button>
    </div>
  );
}

export function TikatukaSim() {
  const initial = loadStore();
  // 새로고침하면 항상 선공 선택부터 — started는 복원하지 않는다(저장값 무시).
  const [started, setStarted] = useState<boolean>(false);
  const [firstTurn, setFirstTurn] = useState<Owner>(() => initial?.firstTurn ?? 'me');
  const [turn, setTurn] = useState<Owner>(() => initial?.turn ?? 'me'); // 현재 턴(행동 주체)
  // 아직 첫 쉴드를 놓지 않은 선공측(놓으면 null). 선공측 첫 주사위 = 쉴드.
  const [firstShield, setFirstShield] = useState<Owner | null>(() => initial?.firstShield ?? null);
  const [grid, setGrid] = useState<Grid>(() => initial?.grid ?? emptyGrid());
  const [tazza, setTazza] = useState<boolean>(() => initial?.tazza ?? true);
  const [star, setStar] = useState<AiLevel | null>(() => initial?.star ?? null); // 상대 난이도(★) — 기록 태그용(선택)
  const [value, setValue] = useState<DieValue | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [tazzaMode, setTazzaMode] = useState(false); // 타짜 택1 입력 중
  const [t2, setT2] = useState<DieValue | null>(null); // 타짜 둘째 눈(첫 눈 = value)
  const [past, setPast] = useState<Snap[]>([]);
  // 추천/승률/홀드/계산중 — 시뮬·게임 공용 워커 풀 훅(단일 진리원).
  const { advice, winRate, hold, computing, request: requestAdvice, reset: resetAdvice } = useAdvisorPool();
  const [adviceOpen, setAdviceOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const { pipWindow, openPip } = usePipWindow(460, 820);

  // 실전 기록 — 진행 중 경기 로그(ref로 유지), 기록 ON/OFF, 이번 세션 저장 수.
  const [record, setRecord] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REC_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [allGames, setAllGames] = useState<SimGameLog[] | null>(null); // RTDB 누적 저장 경기(카운트·분석 공용, 세션 무관)
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const gameRef = useRef<SimGameLog | null>(null); // 진행 중 경기
  const pendingPushRef = useRef<Omit<SimMoveEvent, 'seq'> | null>(null); // 알까기 수(쉴드 배치까지 합쳐 1수로 기록)
  const tazzaShotRef = useRef<{ rolled: [DieValue, DieValue]; chosen: DieValue } | null>(null); // 직전 타짜 택1
  const savedIdRef = useRef<string | null>(null); // 마지막 저장 후 변경 없음 표시(중복 저장 방지)

  useEffect(() => {
    try {
      localStorage.setItem(REC_KEY, record ? '1' : '0');
    } catch {
      /* 무시 */
    }
  }, [record]);
  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 2500);
    return () => clearTimeout(t);
  }, [saveMsg]);
  // RTDB 누적 저장 경기 — 마운트 시 1회 조회(세션 카운터가 아니라 실제 저장량 + 분석 소스). 실패하면 null 유지.
  useEffect(() => {
    let alive = true;
    fetchAllSimGames()
      .then((games) => alive && setAllGames(games))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 새 경기 로그 시작(선공 결정 시). 기록 OFF면 로그를 만들지 않는다.
  const startGameLog = (ft: Owner) => {
    pendingPushRef.current = null;
    tazzaShotRef.current = null;
    savedIdRef.current = null;
    gameRef.current = record
      ? { v: 1, id: genGameId(), player: readPlayerName(), star, firstTurn: ft, startedAt: new Date().toISOString(), endedAt: '', events: [], outcome: null }
      : null;
  };
  // 한 수 기록(seq 자동). 기록 OFF/로그 없음이면 무시.
  const pushEvent = (ev: Omit<SimMoveEvent, 'seq'>) => {
    const g = gameRef.current;
    if (!g || !record) return;
    g.events.push({ seq: g.events.length, ...ev });
    if (savedIdRef.current === g.id) savedIdRef.current = null; // 저장 이후 내용 바뀜 → 재저장 허용
  };
  // 내 수일 때 어드바이저 맥락(추천/승률/추천을 따랐는지).
  const adviceCtx = (act: 'place' | 'push', line: LineIndex) => ({
    advice: advice ? { kind: advice.kind, line: advice.line, side: advice.side } : null,
    followedAdvice: advice ? advice.kind === act && (advice.line === undefined || advice.line === line) : undefined,
    winRateBefore: winRate,
  });
  // 완성된 경기만 저장한다 — 한쪽 진영의 3필드가 모두 차면(보드 가득) 그게 곧 경기 종료다.
  // 홀드(viaHold)면 보드가 덜 찼어도 '그 판세 그대로' 한 판 종료로 보고 저장한다(endedBy:'hold').
  // 미완성/중도 포기 경기는 RTDB에 아예 안 남긴다(저장 안 함 = 따로 지울 필요도 없음). 매 수 직후 onField에서 호출.
  const finalizeAndSave = useCallback(async (g: Grid, viaHold = false) => {
    const game = gameRef.current;
    if (!record || !game || game.events.length === 0) return;
    if (!viaHold && !(allFull(g, 'me') || allFull(g, 'ai'))) return; // 미완성 → 저장 안 함(홀드면 통과)
    if (savedIdRef.current === game.id) return; // 같은 내용 중복 저장 방지(새 수가 들어오면 pushEvent가 해제)
    const r = evaluate(gridToBoard(g), false);
    const finalized: SimGameLog = {
      ...game,
      endedAt: new Date().toISOString(),
      endedBy: viaHold ? 'hold' : 'board',
      outcome: { winner: r.winner, meLineWins: r.meLineWins, aiLineWins: r.aiLineWins, meTotal: r.meTotal, aiTotal: r.aiTotal },
    };
    savedIdRef.current = game.id;
    try {
      await saveSimGame(finalized);
      setAllGames((prev) => {
        const rest = (prev ?? []).filter((x) => x.id !== game.id); // 재저장이면 기존 항목 교체(중복 방지)
        return [finalized, ...rest];
      });
    } catch {
      savedIdRef.current = null; // 실패 → 재시도 허용
      setSaveMsg('저장 실패 — RTDB 권한/네트워크 확인');
    }
  }, [record]);

  // PiP 토글 바를 항상 맨 위에 붙이고, PiP가 열려 있으면 시뮬 본체를 PiP 창으로 포털한다(본체는 그대로 마운트 유지).
  const renderWithPip = (content: ReactNode) => {
    const withBar = (
      <div className="flex flex-col gap-4">
        <PipBar pipWindow={pipWindow} onOpen={openPip} />
        {content}
      </div>
    );
    if (pipWindow) {
      return (
        <>
          <PipPlaceholder onClose={() => pipWindow.close()} />
          {createPortal(withBar, pipWindow.document.body)}
        </>
      );
    }
    return withBar;
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ grid, firstTurn, turn, started, firstShield, tazza, star }));
    } catch {
      /* 무시 */
    }
  }, [grid, firstTurn, turn, started, firstShield, tazza, star]);


  // 추천 요청 — 예상 승률은 즉시(가벼움), 최선 수는 워커에 위임(무거운 탐색). 입력이 바뀌면 디바운스 후 요청.
  // 추천은 '내 턴'에만(상대 턴엔 기록만). 내가 얻은 쉴드 배치만 추천(상대 쉴드는 관찰 기록).
  useEffect(() => {
    if (!started) {
      resetAdvice();
      return;
    }
    const board = gridToBoard(grid);

    // 어떤 추천을 계산할지(없으면 승률만 갱신). 추천은 내 턴 / 내가 얻은 쉴드일 때만.
    let advReq: AdvReq = null;
    if (pending && pending.value != null) {
      if (pending.pusher === 'me') advReq = { kind: 'shield', value: pending.value };
    } else if (pending || turn !== 'me') {
      advReq = null;
    } else if (tazzaMode) {
      if (value != null && t2 != null) advReq = { kind: 'choose', value, value2: t2 };
    } else if (value != null) {
      advReq = { kind: 'move', value };
    }

    // 선공/후수·선공 첫 쉴드 여부 — 타짜(롤) 추천 문턱 보정용 맥락. 워커 풀 훅이 computing·집계·홀드까지 처리.
    const ctxObj = { iAmFirst: firstTurn === 'me', isFirstShield: firstShield === 'me' };
    const t = setTimeout(() => requestAdvice(board, turn, advReq, ctxObj, tazza), 200);
    return () => clearTimeout(t);
    // requestAdvice/resetAdvice는 안정 ref/세터만 사용 — deps 제외(매 렌더 재실행 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, value, t2, tazzaMode, tazza, pending, turn, started, firstTurn, firstShield]);

  const snapshot = (): Snap => ({ grid, firstShield, turn, pending });
  const undo = () => {
    if (!past.length) return;
    const s = past[past.length - 1];
    setGrid(s.grid);
    setFirstShield(s.firstShield);
    setTurn(s.turn);
    setPending(s.pending);
    setPast(past.slice(0, -1));
    setValue(null);
    setTazzaMode(false);
    setT2(null);
  };

  const begin = (ft: Owner) => {
    void finalizeAndSave(grid); // 이전 경기 미저장분이 있으면 현재 판세로 보존
    setFirstTurn(ft);
    setTurn(ft);
    setFirstShield(ft);
    setGrid(emptyGrid());
    setPast([]);
    setPending(null);
    setValue(null);
    setTazza(true); // 새 게임 = 타짜(게임당 1회) 새로 보유
    setTazzaMode(false);
    setT2(null);
    setStarted(true);
    startGameLog(ft); // 새 경기 로그 시작
  };

  // 행동 후 턴 넘기기 — desired가 둘 곳 없으면(전 필드 풀) 상대로 자동 패스(둘 곳 생길 때까지 상대 턴 지속).
  // 둘 다 풀이면 보드 가득 → 더 둘 수 없음(종료).
  const advanceFrom = (g: Grid, desired: Owner) => {
    const t = allFull(g, desired) && !allFull(g, opponentOf(desired)) ? opponentOf(desired) : desired;
    setTurn(t);
    setValue(null);
    setTazzaMode(false);
    setT2(null);
  };

  // 라인 자동 판정 — 상대 라인에 같은 값(비쉴드)이 있으면 알까기 강제, 없으면 내 필드 놓기.
  // 따라서 한 라인엔 (놓기=내 필드) 또는 (알까기=상대 필드) 중 하나만 켜진다. 미는 쪽 필드가 꽉 차면
  // 알까기 불가(필드잠금), 놓기도 내 필드가 꽉 차면 불가. (쉴드 배치 대기 중엔 어느 필드든 빈자리에 배치.)
  const fieldActionOf = (line: LineIndex, owner: Owner): FieldAct => {
    if (pending && pending.value != null) return grid[line][owner].length < 3 ? 'shield' : null;
    if (pending || tazzaMode || value == null) return null;
    const opp = opponentOf(turn);
    const oppMatch = grid[line][opp].some((p) => !p.shield && p.value === value);
    const ownFull = grid[line][turn].length >= 3;
    if (owner === turn) return !ownFull && !oppMatch ? 'place' : null; // 매칭 없으면 놓기
    return oppMatch && !ownFull ? 'push' : null; // 매칭 있으면 알까기(필드잠금 아니면)
  };

  const onField = (line: LineIndex, owner: Owner) => {
    const act = fieldActionOf(line, owner);
    if (!act) return;
    setPast((p) => [...p, snapshot()].slice(-40));

    if (act === 'shield') {
      const ng = addPiece(grid, line, owner, { value: pending!.value!, shield: true, owner: pending!.pusher });
      // 진행 중이던 알까기 수에 쉴드 배치를 합쳐 1수로 기록(미는 쪽이 얻은 쉴드만).
      if (pendingPushRef.current && pending!.pusher === pendingPushRef.current.actor) {
        pushEvent({ ...pendingPushRef.current, shield: { value: pending!.value!, line, owner } });
      }
      pendingPushRef.current = null;
      setGrid(ng);
      setPending(null);
      advanceFrom(ng, opponentOf(turn)); // 쉴드 배치로 그 턴 종료 → 다음 턴(둘 곳 없으면 자동 패스)
      void finalizeAndSave(ng); // 완성됐으면 저장(미완성이면 내부에서 무시)
      return;
    }
    if (act === 'place') {
      const isShield = firstShield === owner; // 선공측 첫 주사위 → 쉴드
      pushEvent({
        actor: turn,
        boardBefore: cloneGrid(grid),
        roll: value!,
        tazza: tazzaShotRef.current ?? undefined,
        action: 'place',
        line,
        ...(turn === 'me' ? adviceCtx('place', line) : {}),
      });
      tazzaShotRef.current = null;
      const ng = addPiece(grid, line, owner, { value: value!, shield: isShield, owner });
      setGrid(ng);
      if (isShield) setFirstShield(null);
      advanceFrom(ng, opponentOf(turn));
      void finalizeAndSave(ng); // 완성됐으면 저장(미완성이면 내부에서 무시)
      return;
    }
    // act === 'push' — 상대 필드(owner)의 같은 값 제거. 미는 쪽=turn → 쉴드 획득(값 입력 후 배치). 턴 유지.
    // 알까기 수는 쉴드 배치까지 합쳐 1수로 기록 → 여기선 보류해 두고 'shield' 단계에서 확정.
    pendingPushRef.current = {
      actor: turn,
      boardBefore: cloneGrid(grid),
      roll: value!,
      tazza: tazzaShotRef.current ?? undefined,
      action: 'push',
      line,
      ...(turn === 'me' ? adviceCtx('push', line) : {}),
    };
    tazzaShotRef.current = null;
    setGrid(removeMatching(grid, line, owner, value!));
    setPending({ pusher: turn, value: null });
  };

  const applyTazza = (chosen: DieValue) => {
    if (value != null && t2 != null) tazzaShotRef.current = { rolled: [value, t2], chosen }; // 다음 수에 타짜 기록
    setValue(chosen);
    setT2(null);
    setTazzaMode(false);
    setTazza(false);
  };

  // ── 선공 선택 화면 ──
  if (!started) {
    return renderWithPip(
      <div className="flex flex-col gap-4">
        <Intro />
        {/* 상대 난이도(선택) — 기록에 ★를 태그해 난이도별로 분석(필수 아님). */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 lg:text-base">
            <Swords size={16} className="text-rose-500" /> 상대 난이도{' '}
            <span className="text-[11px] font-normal text-zinc-400">(선택 — 기록에 ★ 태그)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([null, 1, 2, 3, 4, 5] as (AiLevel | null)[]).map((s) => (
              <button
                key={String(s)}
                onClick={() => setStar(s)}
                className={`inline-flex h-9 min-w-[3rem] items-center justify-center rounded-lg border px-2 text-xs font-bold transition-colors ${
                  star === s
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-rose-400 hover:bg-rose-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                }`}
              >
                {s === null ? '모름' : `★${s}`}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-700 dark:text-zinc-200 lg:text-base">
            <Flag size={16} className="text-indigo-500" /> 선공(먼저 두는 쪽)을 고르세요
          </div>
          <p className="mb-3 text-[11px] text-zinc-500 lg:text-sm">
            선공측의 첫 주사위는 쉴드로 자동 처리되고, 이후 턴이 번갈아 진행됩니다.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => begin('me')}
              className="rounded-xl border-2 border-emerald-300 bg-emerald-50 py-4 text-base font-bold text-emerald-700 hover:border-emerald-500 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              선공: 나
            </button>
            <button
              onClick={() => begin('ai')}
              className="rounded-xl border-2 border-rose-300 bg-rose-50 py-4 text-base font-bold text-rose-700 hover:border-rose-500 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200"
            >
              선공: 상대
            </button>
          </div>
        </div>
      </div>
    );
  }

  const needShieldValue = pending != null && pending.value == null;
  const placingShield = pending != null && pending.value != null;
  const meName = turn === 'me' ? '내' : '상대';

  return renderWithPip(
    <div className="flex flex-col gap-4">
      {/* 승률 + 추천 (상단) — 상태(계산중/승률만/추천)와 무관하게 항상 같은 구조(승률 줄 + 한 줄 헤드라인)라
          접힌 상태 높이가 고정된다. 근거를 펼칠 때(open)만 아래로 늘어나므로 보드가 들썩이지 않는다. */}
      {(() => {
        const active = hold ?? advice ?? null; // 추천은 하나만 표시(홀드 우선)
        const isHold = !!hold;
        const open = isHold ? holdOpen : adviceOpen;
        const toggle = isHold ? () => setHoldOpen((v) => !v) : () => setAdviceOpen((v) => !v);
        const tone = isHold
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30'
          : active
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50';
        return (
          <div className={`rounded-2xl border p-3 ${tone}`}>
            {/* 1줄: 예상 승률 (항상 표시 — 높이 고정용) */}
            <div className="mb-2 flex h-5 items-center gap-2">
              <span className="shrink-0 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">예상 승률</span>
              {winRate != null ? (
                <WinRateBar winRate={winRate} />
              ) : (
                <span className="text-[11px] font-bold text-zinc-400">—</span>
              )}
            </div>
            {/* 2줄: 추천 헤드라인 (항상 한 줄 — 계산중/추천없음도 같은 높이) */}
            {computing ? (
              <div className="flex h-5 items-center gap-2 text-sm font-bold text-zinc-500 dark:text-zinc-400">
                <Loader2 size={16} className="animate-spin text-indigo-500" />
                계산 중…
              </div>
            ) : active ? (
              <button
                type="button"
                onClick={toggle}
                className="flex h-5 w-full items-center justify-between gap-2 text-left"
              >
                <span
                  className={`flex min-w-0 items-center gap-1.5 text-sm font-bold ${
                    isHold ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {isHold ? <Hand size={16} className="shrink-0" /> : <Lightbulb size={16} className="shrink-0" />}
                  <span className="truncate">추천 — {active.headline}</span>
                </span>
                <span className="shrink-0 text-[11px] font-bold text-zinc-400">근거 {open ? '▴' : '▾'}</span>
              </button>
            ) : (
              <div className="flex h-5 items-center text-sm font-medium text-zinc-400">
                둘 곳을 누르면 추천이 나와요
              </div>
            )}
            {/* 펼침: 근거 (open일 때만 — 이때만 높이 증가) */}
            {!computing && active && open && <FactorList factors={active.factors} />}
          </div>
        );
      })()}

      {/* 보드 */}
      <div className="flex flex-col gap-2.5 lg:gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1 text-xs font-bold lg:text-base">
          <span className="text-emerald-600 dark:text-emerald-400">내 필드</span>
          <span className={`mx-auto rounded-full px-2 py-0.5 text-[10px] text-white ${turn === 'me' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {turn === 'me' ? '내 차례' : '상대 차례'}
          </span>
          <span className="text-right text-rose-600 dark:text-rose-400">상대 필드</span>
        </div>

        {LINES.map((line) => {
          const meSum = fieldSum(grid[line].me, 'me');
          const aiSum = fieldSum(grid[line].ai, 'ai');
          const winner: Owner | 'tie' = meSum > aiSum ? 'me' : aiSum > meSum ? 'ai' : 'tie';
          return (
            <div
              key={line}
              className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/40 sm:gap-2 sm:p-2 lg:gap-3 lg:p-3"
            >
              <SimField
                field={grid[line].me}
                owner="me"
                action={fieldActionOf(line, 'me')}
                advice={advice?.line === line && advice.side === 'me'}
                onClick={() => onField(line, 'me')}
              />
              <div className="flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 lg:min-w-[110px] lg:gap-1">
                <span className="text-[10px] font-bold text-zinc-400 lg:text-sm">{line + 1}번</span>
                {/* 점수 — 자릿수가 달라도 라인 폭이 어긋나지 않게 각 수를 고정폭 셀로(콜론 기준 정렬). */}
                <span className="font-bold tabular-nums lg:text-2xl">
                  <span className="inline-block w-[1.3em] text-right text-emerald-500">{meSum}</span>
                  <span className="mx-1 text-zinc-300">:</span>
                  <span className="inline-block w-[1.3em] text-left text-rose-500">{aiSum}</span>
                </span>
                <LineBadge winner={winner} />
              </div>
              <SimField
                field={grid[line].ai}
                owner="ai"
                action={fieldActionOf(line, 'ai')}
                advice={advice?.line === line && advice.side === 'ai'}
                onClick={() => onField(line, 'ai')}
              />
            </div>
          );
        })}
      </div>

      {/* 컨트롤 — 쉴드 값 입력 / 쉴드 배치 / 일반 입력 */}
      {needShieldValue ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30 lg:p-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-300">
            <ShieldCheck size={16} /> {pending!.pusher === 'me' ? '내' : '상대'} 알까기 성공 — 획득한 쉴드 값을 고르세요
          </div>
          <ValueRow label="쉴드 값" value={null} onPick={(v) => setPending((pd) => (pd ? { ...pd, value: v } : pd))} />
          <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70">
            실제 게임에서 굴려 나온 쉴드 값을 입력하면 {pending!.pusher === 'me' ? '추천 칸이 강조됩니다.' : '배치할 칸을 클릭하세요.'}
          </p>
        </div>
      ) : placingShield ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
          {pending!.pusher === 'me' ? '내' : '상대'} 쉴드 {pending!.value} 배치 —{' '}
          {pending!.pusher === 'me' ? '추천 칸(또는 원하는 칸)을' : '상대가 둔 칸을'} 클릭하세요
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50 lg:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300 lg:text-base">{meName} 주사위</span>
            <button
              onClick={() => {
                setTazzaMode((v) => !v);
                setT2(null);
              }}
              disabled={!tazza && !tazzaMode}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                tazzaMode
                  ? 'bg-fuchsia-700 text-white ring-2 ring-fuchsia-300 dark:ring-fuchsia-700'
                  : advice?.kind === 'tazza'
                  ? 'bg-fuchsia-600 text-white ring-2 ring-emerald-400 hover:bg-fuchsia-500'
                  : 'bg-fuchsia-600 text-white hover:bg-fuchsia-500 active:bg-fuchsia-700'
              }`}
            >
              <Sparkles size={14} /> 타짜 택1{tazzaMode ? ' 닫기' : ''}
              {advice?.kind === 'tazza' && !tazzaMode && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[9px] text-white">추천</span>
              )}
            </button>
            <button
              onClick={() => setTazza((t) => !t)}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                tazza ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
              }`}
            >
              타짜 보유 {tazza ? 'O' : 'X'}
            </button>
          </div>

          {tazzaMode ? (
            <div className="flex flex-col gap-2">
              <ValueRow label="첫 눈" value={value} onPick={setValue} />
              <ValueRow label="둘째 눈" value={t2} onPick={setT2} />
              {value != null && t2 != null ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-zinc-500">선택 적용:</span>
                  {([value, t2] as DieValue[]).map((v, i) => {
                    const rec = advice?.kind === 'choose' && advice.chooseIndex === i;
                    return (
                      <button
                        key={i}
                        onClick={() => applyTazza(v)}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                          rec
                            ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {v} 사용 {rec && <span className="rounded-full bg-white/25 px-1.5 py-px text-[9px]">추천</span>}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => {
                      setTazzaMode(false);
                      setT2(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-600"
                  >
                    <X size={14} /> 취소
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500">타짜로 굴린 두 눈을 입력하면 어느 쪽이 좋은지 추천해요.</p>
              )}
            </div>
          ) : (
            <>
              <ValueRow label="굴린 값" value={value} onPick={setValue} />
              <p className="text-[11px] text-zinc-500">
                값을 고르면 둘 곳·밀 곳이 자동으로 켜져요 — 켜진 칸을 클릭하세요. 상대 라인에 같은 값이 있으면
                알까기, 없으면 놓기로 자동 판정합니다.
              </p>
            </>
          )}
        </div>
      )}


      {/* 실전 기록 — 양측 수를 RTDB에 자동 적재(시뮬 정확도 개선용). 매 수 후 자동 저장, 버튼 불필요. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
        <button
          onClick={() => setRecord((r) => !r)}
          title="실제 경기 입력을 데이터로 쌓아 시뮬 정확도를 높입니다"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
            record ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${record ? 'bg-white' : 'bg-zinc-400'}`} /> 실전 기록 {record ? 'ON' : 'OFF'}
        </button>
        <span className="text-[11px] text-zinc-500">
          {record
            ? `자동 저장 중 · ${star === null ? '난이도 모름' : `★${star}`} · 누적 ${allGames === null ? '…' : allGames.length}경기`
            : '기록 꺼짐'}
        </span>
        {saveMsg && (
          <span className="ml-auto text-[11px] font-bold text-rose-600 dark:text-rose-400">{saveMsg}</span>
        )}
      </div>

      {/* 컨트롤 버튼 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            // 홀드 = 더 두지 않고 '현재 판세 그대로' 한 판 종료로 기록한 뒤 새 판(선공 선택)으로.
            void finalizeAndSave(grid, true);
            gameRef.current = null;
            setStarted(false);
            setGrid(emptyGrid());
            setPast([]);
            setPending(null);
            setValue(null);
            setTazzaMode(false);
            setT2(null);
          }}
          title="더 두지 않고 지금 판세 그대로 한 판을 끝냅니다(기록 ON이면 홀드 종료로 저장)"
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            hold
              ? 'bg-amber-500 text-white ring-2 ring-emerald-400 hover:bg-amber-400'
              : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50'
          }`}
        >
          <Hand size={15} /> 홀드 (이 판 종료)
          {hold && <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[9px] text-white">추천</span>}
        </button>
        <button
          onClick={undo}
          disabled={!past.length}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <Undo2 size={15} /> 되돌리기
        </button>
        <button
          onClick={() => {
            // 선공 선택 화면으로 — 선공을 다시 고르면 보드가 새로 시작된다.
            void finalizeAndSave(grid); // 진행 중 경기 미저장분 보존
            gameRef.current = null;
            setStarted(false);
            setGrid(emptyGrid());
            setPast([]);
            setPending(null);
            setValue(null);
            setTazzaMode(false);
            setT2(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <RotateCcw size={15} /> 보드 초기화 (선공부터)
        </button>
      </div>
    </div>
  );
}

// ── 한 필드 — 통째로 클릭. action(현재 가능한 동작)에 따라 색/활성 결정. 같은 눈 묶음 체인 표시 ──
function SimField({
  field,
  owner,
  action,
  advice,
  onClick,
}: {
  field: Field;
  owner: Owner;
  action: FieldAct;
  advice?: boolean;
  onClick: () => void;
}) {
  const slots = displaySlots(field, owner);
  const ring = advice
    ? 'ring-2 ring-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
    : action === 'place'
      ? 'ring-1 ring-emerald-300 hover:ring-2 hover:ring-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
      : action === 'push'
        ? 'ring-1 ring-rose-300 hover:ring-2 hover:ring-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
        : action === 'shield'
          ? 'ring-1 ring-amber-300 hover:ring-2 hover:ring-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
          : '';
  return (
    <button
      type="button"
      disabled={action == null}
      onClick={onClick}
      className={`relative flex touch-manipulation items-center gap-1 rounded-xl p-1 transition-colors disabled:cursor-default sm:gap-1.5 sm:p-1.5 ${owner === 'me' ? 'justify-end' : 'justify-start'} ${ring}`}
    >
      {advice && (
        <span className="pointer-events-none absolute -top-2 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold text-white shadow">
          추천
        </span>
      )}
      {slots.map((p, i) => {
        const die: Die | null = p ? makeDie(p.value, p.owner, p.shield) : null;
        return die ? (
          <DiePip key={i} die={die} className={DIE} />
        ) : (
          <span
            key={i}
            className={`block rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 ${DIE}`}
          />
        );
      })}

      {/* 묶음(같은 눈) 강조 — `][` + 묶음 값 원. absolute라 주사위 크기·간격·필드 폭에 영향 없음. */}
      <DiceGroupOverlay
        slots={slots.map((p) => (p ? { value: p.value } : null))}
        owner={owner}
        justify={owner === 'me' ? 'end' : 'start'}
        dieSize={DIE}
      />
    </button>
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

// 승패 = 고정폭 아이콘(승자 진영 쪽 화살표). 내 승=<<(인디고), 상대 승=>>(로즈), 무=—(회색).
function LineBadge({ winner }: { winner: Owner | 'tie' }) {
  const meta =
    winner === 'me'
      ? { Icon: ChevronsLeft, c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
      : winner === 'ai'
        ? { Icon: ChevronsRight, c: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' }
        : { Icon: Minus, c: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' };
  const { Icon } = meta;
  return (
    <span className={`inline-flex items-center justify-center rounded-full p-1 ${meta.c}`}>
      <Icon size={14} strokeWidth={2.5} />
    </span>
  );
}

function Intro() {
  return (
    <div className="flex gap-2 rounded-xl bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-900/80 dark:bg-indigo-950/30 dark:text-indigo-200/80 lg:text-sm">
      <Info size={16} className="mt-0.5 shrink-0 text-indigo-500" />
      <span>
        인게임 진행을 그대로 따라 입력하는 보조 도구예요. <b>선공</b>을 고르면 턴이 번갈아 진행되고, 매 턴 값을 골라
        켜진 칸을 클릭하면(같은 값이 있으면 알까기·없으면 놓기로 자동 판정) 추천과 예상 승률을 알려줍니다.
      </span>
    </div>
  );
}
