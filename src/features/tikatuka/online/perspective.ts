// 온라인 1:1 관점 변환 — 정식(canonical) 상태는 host 관점(me=host, ai=guest)으로 저장.
// guest 클라는 수신 상태를 flipState로 뒤집어(me=자기) UI/엔진에 먹이고, 다시 뒤집어 기록.
// 엔진/리듀서는 'me' 중심이므로 각 클라는 항상 자기를 'me'로 플레이 → 엔진 무수정 재사용.
import type { Die, Field, GameState, LineState, Owner, Phase, ResultDetail } from '../types';

function flipOwner(o: Owner): Owner {
  return o === 'me' ? 'ai' : 'me';
}

// 'me' 턴 시작과 'ai' 턴 시작은 관점을 뒤집으면 서로 바뀐다(나머지 단계는 행동 클라 로컬에만 존재).
function flipPhase(p: Phase): Phase {
  if (p === 'rolling') return 'aiThinking';
  if (p === 'aiThinking') return 'rolling';
  return p;
}

function flipDie(d: Die): Die {
  return { ...d, owner: flipOwner(d.owner) };
}

function flipField(f: Field): Field {
  return f.map(flipDie);
}

function flipLine(l: LineState): LineState {
  return { me: flipField(l.ai), ai: flipField(l.me) };
}

function flipResult(r: ResultDetail): ResultDetail {
  return {
    lines: r.lines.map((ln) => ({ meSum: ln.aiSum, aiSum: ln.meSum, winner: ln.winner === 'tie' ? 'tie' : flipOwner(ln.winner) })) as ResultDetail['lines'],
    meLineWins: r.aiLineWins,
    aiLineWins: r.meLineWins,
    meTotal: r.aiTotal,
    aiTotal: r.meTotal,
    tikatukaBonus: r.tikatukaBonus, // "승자가 선언했는가" — 관점 무관
    winner: r.winner === 'draw' ? 'draw' : flipOwner(r.winner),
  };
}

// 상태를 반대 관점으로 변환(자기 ↔ 상대). 자기역(involution): flip(flip(s)) === s.
export function flipState(s: GameState): GameState {
  return {
    ...s,
    board: { lines: s.board.lines.map(flipLine) as GameState['board']['lines'] },
    turn: flipOwner(s.turn),
    phase: flipPhase(s.phase),
    rolledDie: s.rolledDie ? flipDie(s.rolledDie) : null,
    rolledChoices: s.rolledChoices ? [flipDie(s.rolledChoices[0]), flipDie(s.rolledChoices[1])] : null,
    pendingShield: s.pendingShield ? flipDie(s.pendingShield) : null,
    tazzaUsed: { me: s.tazzaUsed.ai, ai: s.tazzaUsed.me },
    tikatukaUsed: { me: s.tikatukaUsed.ai, ai: s.tikatukaUsed.me },
    pendingFirstShield: s.pendingFirstShield ? flipOwner(s.pendingFirstShield) : null,
    winner: s.winner == null ? s.winner : s.winner === 'draw' ? 'draw' : flipOwner(s.winner),
    result: s.result ? flipResult(s.result) : null,
    // held: 1:1에선 미사용(항상 false) — 그대로 둔다.
  };
}

// 좌석 ↔ 관점 변환 헬퍼. canonical은 host 관점.
export function toCanonical(local: GameState, seat: 'host' | 'guest'): GameState {
  return seat === 'host' ? local : flipState(local);
}

export function fromCanonical(canonical: GameState, seat: 'host' | 'guest'): GameState {
  return seat === 'host' ? canonical : flipState(canonical);
}
