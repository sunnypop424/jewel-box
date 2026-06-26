// 티카투카 1:1 온라인 대전 — 로비(방 만들기/참여/대기방 목록) + 실시간 대국.
import { useEffect, useRef, useState } from 'react';
import { Dices, Megaphone, Swords, Trophy, RotateCcw, Copy, Users, LogOut, WifiOff, Check } from 'lucide-react';
import { Board } from './components/Board';
import { DiceTray, type RollAnim } from './components/DiceTray';
import { EmotePicker, EmoteBubble } from './components/Emote';
import { canDeclareTikatuka } from './reducer';
import { useTikatukaOnline } from './online/useTikatukaOnline';
import {
  createRoom,
  joinRoom,
  cancelRoom,
  deleteRoom,
  cleanupStaleRooms,
  subscribeOpenRooms,
  MY_ROOM_KEY,
  type Seat,
  type TikatukaRoom,
} from './online/room';
import { fetchPlayer } from './playerStore';
import { levelForTp } from './tp';
import { cardClass, inputClass, btnPrimary, btnDark } from './ui';
import type { GameState, Owner } from './types';

interface Session {
  code: string;
  seat: Seat;
}

// 한 진영의 트레이 굴림 표시 — 내 턴/상대 턴 모두 같은 로직으로(상대 주사위도 보이게).
function trayAnim(s: GameState, owner: Owner): RollAnim | null {
  if (s.turn !== owner) return null;
  if (s.phase === 'rolling' || s.phase === 'aiThinking') return { owner, values: [], tumbling: true, chosen: null };
  if (s.phase === 'choosingDie' && s.rolledChoices)
    return { owner, values: [s.rolledChoices[0].value, s.rolledChoices[1].value], tumbling: false, chosen: null };
  if (s.phase === 'acting' && s.rolledDie) return { owner, values: [s.rolledDie.value], tumbling: false, chosen: null };
  return null;
}

// 한 진영의 트레이 쉴드 표시(배치 대기 또는 선공 첫 쉴드 주사위).
function trayShield(s: GameState, owner: Owner) {
  if (s.turn !== owner) return null;
  if (s.phase === 'placingShield') return s.pendingShield;
  if (s.phase === 'acting' && s.rolledDie?.shield) return s.rolledDie;
  return null;
}

export function TikatukaPvp({ myName }: { myName: string }) {
  const [session, setSession] = useState<Session | null>(null);
  return session ? (
    <PvpRoom code={session.code} seat={session.seat} myName={myName} onLeaveLobby={() => setSession(null)} />
  ) : (
    <Lobby myName={myName} onEnter={setSession} />
  );
}

// ── 로비 ──────────────────────────────────────────────
function Lobby({ myName, onEnter }: { myName: string; onEnter: (s: Session) => void }) {
  const [rooms, setRooms] = useState<TikatukaRoom[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeOpenRooms(setRooms), []);

  // 로비 진입 시 죽은 방 정리(목록 신선도). 내 대기방 정리는 허브 레벨에서 처리.
  useEffect(() => {
    cleanupStaleRooms().catch(() => {});
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom(myName);
      localStorage.setItem(MY_ROOM_KEY, code); // 새로고침 시 로비 복귀에서 정리
      onEnter({ code, seat: 'host' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await joinRoom(code, myName);
      onEnter({ code: code.toUpperCase(), seat: 'guest' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openRooms = rooms.filter((r) => r.host.name !== myName);

  return (
    <div className="flex flex-col gap-4">
      {/* 방 만들기 */}
      <div className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">새 방 만들기</span>
          <span className="text-xs text-zinc-400">방을 만들고 상대를 기다려요.</span>
        </div>
        <button onClick={create} disabled={busy} className={`${btnPrimary} shrink-0`}>
          <Swords size={16} /> 방 만들기
        </button>
      </div>

      {/* 코드로 참여 */}
      <div className={`${cardClass} flex flex-col gap-2`}>
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">방 코드로 참여</span>
        <div className="flex items-stretch gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="방 코드 입력"
            maxLength={6}
            className={`${inputClass} !h-auto min-w-0 flex-1 font-bold tracking-widest placeholder:font-normal placeholder:tracking-normal`}
          />
          <button
            onClick={() => joinCode.trim() && join(joinCode.trim())}
            disabled={busy || !joinCode.trim()}
            className={`${btnDark} shrink-0`}
          >
            참여
          </button>
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      </div>

      {/* 대기 중인 방 */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          <Users size={14} /> 대기 중인 방 ({openRooms.length})
        </div>
        {openRooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-200 px-3 py-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
            대기 중인 방이 없어요. 방을 만들어 보세요!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {openRooms.map((r) => (
              <div
                key={r.code}
                className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-bold tracking-widest text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {r.code}
                  </span>
                  <span className="truncate text-sm font-bold text-zinc-800 dark:text-zinc-100">{r.host.name}</span>
                </span>
                <button onClick={() => join(r.code)} disabled={busy} className={`${btnPrimary} shrink-0`}>
                  참여하기
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 대국 ──────────────────────────────────────────────
function PvpRoom({
  code,
  seat,
  myName,
  onLeaveLobby,
}: {
  code: string;
  seat: Seat;
  myName: string;
  onLeaveLobby: () => void;
}) {
  const g = useTikatukaOnline(code, seat);
  const { state, room } = g;
  // 종료 스냅샷 — 방 문서를 지워도 결과 화면이 유지되도록 로컬 보관.
  const [finishedRoom, setFinishedRoom] = useState<TikatukaRoom | null>(null);

  // 최신 상태를 ref로 추적(언마운트/언로드 클린업이 '아직 대기중'일 때만 삭제하도록).
  const statusRef = useRef<TikatukaRoom['status'] | undefined>(undefined);
  statusRef.current = room?.status;

  useEffect(() => {
    if (room?.status === 'finished' && room.result) setFinishedRoom((prev) => prev ?? room);
    // 게임이 시작되면(또는 끝나면) 내가 만든 대기방 키는 더 이상 정리 대상이 아님.
    if (room && room.status !== 'waiting') localStorage.removeItem(MY_ROOM_KEY);
  }, [room]);

  // 대기 중 새로고침·탭닫기·탭전환(언마운트) → 빈 방 즉시 삭제. 단 '아직 대기중'일 때만.
  // deps []로 마운트 1회 등록 → waiting→playing 전이 시 클린업이 잘못 삭제하는 것을 방지.
  useEffect(() => {
    const bye = () => {
      if (statusRef.current === 'waiting') {
        deleteRoom(code).catch(() => {});
        localStorage.removeItem(MY_ROOM_KEY);
      }
    };
    window.addEventListener('beforeunload', bye);
    return () => {
      window.removeEventListener('beforeunload', bye);
      bye();
    };
  }, [code]);

  // 종료 화면(스냅샷 기준).
  if (finishedRoom && finishedRoom.result) {
    return (
      <PvpResult
        seat={seat}
        myName={myName}
        room={finishedRoom}
        onExit={() => {
          deleteRoom(code).catch(() => {});
          localStorage.removeItem(MY_ROOM_KEY);
          onLeaveLobby();
        }}
      />
    );
  }

  // 대기 화면(호스트가 상대를 기다림).
  if (room?.status === 'waiting') {
    return (
      <div className={`${cardClass} flex flex-col items-center gap-4 py-8 text-center`}>
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-500">
          <Dices size={16} className="animate-spin text-indigo-400" /> 상대를 기다리는 중…
        </div>
        <button
          onClick={() => navigator.clipboard?.writeText(code).catch(() => {})}
          className="inline-flex items-center gap-2 rounded-2xl bg-indigo-50 px-6 py-4 text-3xl font-black tracking-[0.3em] text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
          title="코드 복사"
        >
          {code} <Copy size={18} />
        </button>
        <div className="text-xs text-zinc-400">이 코드를 상대에게 알려주거나, 상대가 대기방 목록에서 참여할 수 있어요.</div>
        <button
          onClick={() => {
            cancelRoom(code).catch(() => {});
            localStorage.removeItem(MY_ROOM_KEY);
            onLeaveLobby();
          }}
          className="text-xs font-bold text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          방 취소
        </button>
      </div>
    );
  }

  // 진행 화면. 내/상대 트레이 모두 상태에서 파생 → 양쪽 주사위 상태가 다 보인다.
  const meAnim = trayAnim(state, 'me');
  const aiAnim = trayAnim(state, 'ai');

  const tazzaEnabled = g.myTurn && state.phase === 'acting' && !state.tazzaUsed.me;
  const tikatukaEnabled = canDeclareTikatuka(state, 'me') && room?.status === 'playing';
  const declaredBy = state.tikatukaUsed.me ? myName : state.tikatukaUsed.ai ? g.opponentName : null;

  return (
    <div className="flex flex-col gap-4">
      {/* 상단: 나 vs 상대 + 턴 (감정표현 말풍선은 각 이름표 옆으로) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm font-bold">
        <div className="relative min-w-0 justify-self-start">
          <span className={`flex max-w-full items-center gap-1 rounded-xl border px-3 py-2 ${g.myTurn ? 'border-indigo-400 bg-indigo-50 text-indigo-600 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300' : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'}`}>
            <span className="min-w-[3.5em] truncate">{myName}</span>
            {g.myTurn && (
              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-500 p-0.5 text-white" title="내 차례">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </span>
          {g.myEmote && <EmoteBubble key={g.myEmote.n} kind={g.myEmote.kind} side="left" />}
        </div>
        {/* 가운데: 감정표현 버튼(자유전 '지원 ON/OFF' 자리와 동일한 위치·디자인) */}
        <div className="justify-self-center">
          <EmotePicker onSend={g.sendEmote} />
        </div>
        <div className="relative min-w-0 justify-self-end">
          <span className={`block max-w-full truncate rounded-xl border px-3 py-2 ${!g.myTurn ? 'border-rose-400 bg-rose-50 text-rose-600 dark:border-rose-600 dark:bg-rose-950/40 dark:text-rose-300' : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'}`}>
            {g.opponentName}
          </span>
          {g.oppEmote && <EmoteBubble key={g.oppEmote.n} kind={g.oppEmote.kind} side="right" />}
        </div>
      </div>

      {/* 티카투카 선언 표시(둘 중 한 명만) */}
      {declaredBy && (
        <div className="flex items-center justify-center gap-1.5 rounded-xl bg-fuchsia-50 px-3 py-2 text-sm font-bold text-fuchsia-600 dark:bg-fuchsia-950/30 dark:text-fuchsia-300">
          <Megaphone size={15} /> {declaredBy} 티카투카 선언!
        </div>
      )}

      {/* 상대 이탈 안내 */}
      {g.opponentStale && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <span className="flex items-center gap-1.5">
            <WifiOff size={14} /> 상대 연결이 끊긴 것 같아요.
          </span>
          <button onClick={g.claimWin} className="rounded-lg bg-amber-500 px-3 py-1 text-white hover:bg-amber-600">
            승리 처리
          </button>
        </div>
      )}

      <Board
        state={state}
        flingIds={g.flingIds}
        pushFx={g.pushFx}
        aiShieldTarget={null}
        adviceTarget={null}
        onPlace={g.place}
        onPush={g.push}
        onPlaceShield={g.placeShield}
      />

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="grid w-full grid-cols-2 gap-2.5">
          <DiceTray
            owner="me"
            active={state.turn === 'me'}
            anim={meAnim}
            shield={trayShield(state, 'me')}
            pickable={state.phase === 'choosingDie' && state.turn === 'me'}
            onPick={g.chooseDie}
            hint={
              state.phase === 'placingShield' && state.turn === 'me'
                ? '쉴드 놓을 칸 선택'
                : state.phase === 'choosingDie' && state.turn === 'me'
                  ? '하나 선택'
                  : undefined
            }
          />
          <DiceTray
            owner="ai"
            active={state.turn === 'ai'}
            anim={aiAnim}
            shield={trayShield(state, 'ai')}
            hint={
              state.turn === 'ai' && state.phase === 'choosingDie'
                ? '상대 타짜 — 선택 중…'
                : state.turn === 'ai' && state.phase === 'placingShield'
                  ? '상대 쉴드 배치 중…'
                  : !g.myTurn
                    ? '상대 차례…'
                    : undefined
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <PvpBtn onClick={g.useTazza} disabled={!tazzaEnabled} icon={<Dices size={14} />} label="타짜의 손놀림" />
          <PvpBtn onClick={g.tikatuka} disabled={!tikatukaEnabled} icon={<Megaphone size={14} />} label="티카투카!" accent />
          <PvpBtn onClick={g.forfeit} disabled={false} icon={<LogOut size={14} />} label="기권/나가기" danger />
        </div>
        <Hint state={state} myTurn={g.myTurn} />
      </div>
    </div>
  );
}

function Hint({ state, myTurn }: { state: ReturnType<typeof useTikatukaOnline>['state']; myTurn: boolean }) {
  let text = '';
  if (!myTurn) text = '상대의 수를 기다리는 중…';
  else if (state.phase === 'placingShield') text = '획득한 쉴드를 놓을 칸을 고르세요.';
  else if (state.phase === 'acting') text = '내 필드에 배치하거나, 같은 라인 같은 눈을 밀어내세요.';
  if (!text) return null;
  return <div className="text-center text-[11px] text-zinc-400">{text}</div>;
}

function PvpResult({
  seat,
  myName,
  room,
  onExit,
}: {
  seat: Seat;
  myName: string;
  room: TikatukaRoom;
  onExit: () => void;
}) {
  const [tp, setTp] = useState<number | null>(null);
  useEffect(() => {
    fetchPlayer(myName)
      .then((p) => setTp(p.tpPvp))
      .catch(() => {});
  }, [myName]);

  const r = room.result!;
  const iWon = r.winnerSeat === seat;
  const draw = r.winnerSeat === 'draw';
  const headline = draw ? '무승부' : iWon ? '승리!' : '패배';
  const color = draw ? 'text-zinc-500' : iWon ? 'text-indigo-600 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-300';

  const oppName = (seat === 'host' ? room.guest?.name : room.host.name) ?? '상대';
  const winCls = 'text-indigo-600 dark:text-indigo-300';
  const loseCls = 'text-rose-600 dark:text-rose-300';
  const drawCls = 'text-zinc-500';
  const myLabel = draw ? '무승부' : iWon ? '승리' : '패배';
  const oppLabel = draw ? '무승부' : iWon ? '패배' : '승리';
  const myCls = draw ? drawCls : iWon ? winCls : loseCls;
  const oppCls = draw ? drawCls : iWon ? loseCls : winCls;

  return (
    <div className={`${cardClass} flex flex-col items-center gap-4 py-8 text-center`}>
      <Trophy size={40} className={color} />
      <span className={`text-3xl font-black ${color}`}>{headline}</span>
      <div className="flex items-center justify-center gap-2 text-sm font-bold">
        <span className={myCls}>
          {myName} <span className="text-xs">({myLabel})</span>
        </span>
        <span className="text-zinc-300">vs</span>
        <span className={oppCls}>
          {oppName} <span className="text-xs">({oppLabel})</span>
        </span>
      </div>
      {r.reason === 'forfeit' && <span className="text-xs font-bold text-amber-500">{iWon ? '상대 기권/이탈로 승리' : '기권/이탈 처리'}</span>}
      {tp != null && (
        <div className="rounded-lg bg-zinc-50 px-6 py-3 dark:bg-zinc-800/60">
          <div className="text-xs text-zinc-400">내 1:1 TP</div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-300">
            {tp.toLocaleString()} TP <span className="text-sm font-bold text-amber-500">Lv.{levelForTp(tp)}</span>
          </div>
        </div>
      )}
      <button onClick={onExit} className={btnPrimary}>
        <RotateCcw size={15} /> 로비로
      </button>
    </div>
  );
}

function PvpBtn({
  onClick,
  disabled,
  icon,
  label,
  accent,
  danger,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex select-none items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        accent
          ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
          : danger
            ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}
