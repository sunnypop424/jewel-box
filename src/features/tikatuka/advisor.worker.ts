// 시뮬 전용 추천 워커 — 메인 스레드를 막지 않고 깊은 탐색으로 최선 수 + 정밀 승률을 계산한다.
//  · 끝까지 롤아웃: ★4(1-step EV) / 상대 즉답: ★5(MC) / 얻는 쉴드: 1~6 전수. (★5를 롤아웃에 중첩하는 건 불가 → 즉답 ply에서만)
//  · 승률: 닫힌형 근사가 아니라 현재 보드에서 끝까지 MC로 직접 추정(현재 턴부터).
import { recommendMove, recommendChoose, recommendShield, recommendHold, recommendHoldLoss, mcWinRate } from './ai';
import type { AdvCfg, Factor } from './ai';
import { evaluate } from './engine';
import type { Board, DieValue, Owner, LineIndex } from './types';

const ctx = self as unknown as Worker;

// 시뮬 깊은 탐색 설정. 무거우니 playouts는 작게(근거리 전수 전개가 분산을 줄여 적은 표본으로도 안정).
const CFG: AdvCfg = { playouts: 150, respLevel: 5, rolloutLevel: 4, expandShield: true, oppPushFirst: true };
const WR_PLAYOUTS = 800; // 정밀 승률용 MC 표본
const WR_LEVEL = 4; // 승률 추정 롤아웃 정책(★4)

type Req =
  | { kind: 'move'; value: DieValue; tazza: boolean }
  | { kind: 'choose'; value: DieValue; value2: DieValue }
  | { kind: 'shield'; value: DieValue };

interface ReqMsg {
  id: number;
  board: Board;
  turn: Owner; // 현재 턴(승률 시뮬 시작 진영)
  advReq: Req | null; // 추천 요청(없으면 승률만 갱신)
  iAmFirst?: boolean; // 내가 선공인가(타짜 문턱 보정용)
  myFirstShield?: boolean; // 지금 굴린 주사위가 선공 첫 쉴드인가(선공 첫 턴)
}
interface Advice {
  kind: string;
  headline: string;
  factors: Factor[];
  line?: LineIndex;
  side?: Owner;
  chooseIndex?: 0 | 1;
}

ctx.onmessage = (e: MessageEvent<ReqMsg>) => {
  const { id, board, turn, advReq, iAmFirst, myFirstShield } = e.data;

  // 정밀 승률 — 현재 턴부터 끝까지 MC. 상대(ai) 측은 알까기-우선으로 모델링(추천과 동일 가정).
  const winRate = mcWinRate(board, 'me', turn, WR_PLAYOUTS, WR_LEVEL, Math.random, 'ai');

  let advice: Advice | null = null;
  if (advReq?.kind === 'move') {
    const a = recommendMove(board, 'me', advReq.value, advReq.tazza, CFG, {
      iAmFirst: !!iAmFirst,
      isFirstShield: !!myFirstShield,
    });
    if (a)
      advice = {
        kind: a.action,
        headline: a.headline,
        factors: a.factors,
        line: a.line,
        side: a.action === 'push' ? 'ai' : a.action === 'place' ? 'me' : undefined,
      };
  } else if (advReq?.kind === 'choose') {
    const a = recommendChoose(board, 'me', [advReq.value, advReq.value2], CFG, {
      iAmFirst: !!iAmFirst,
      isFirstShield: !!myFirstShield,
    });
    advice = { kind: 'choose', headline: a.headline, factors: a.factors, chooseIndex: a.index };
  } else if (advReq?.kind === 'shield') {
    const a = recommendShield(board, 'me', advReq.value);
    if (a) advice = { kind: 'shield', headline: a.headline, factors: a.factors, line: a.line, side: a.owner };
  }

  // 홀드 추천 — 내 차례의 결정 시점(쉴드 배치·타짜 택1 제외)에만. 승리/패배 각각 3단계(확정/권장/고려)로 세분화.
  let hold: Advice | null = null;
  if (turn === 'me' && advReq?.kind !== 'shield' && advReq?.kind !== 'choose') {
    const r = evaluate(board, false);
    const dice = board.lines.reduce((n, l) => n + l.me.length + l.ai.length, 0);
    const wp = Math.round(winRate * 100);
    const lockWin = recommendHold(board, 'me'); // 확정 승리 락(결정론적)
    const lockLoss = recommendHoldLoss(board, 'me'); // 확정 패배 락(결정론적)
    let h: { headline: string; factors: Factor[] } | null = null;
    if (lockWin) {
      h = { headline: `홀드(확정) — 2라인 굳히기`, factors: lockWin.factors };
    } else if (winRate >= 0.9 && r.meLineWins >= 2) {
      h = { headline: `홀드 권장 — 승률 ${wp}% (매우 유리)`, factors: [
        { tag: '홀드', text: `승률이 ${wp}%로 매우 높아요 — 더 둘수록 변수만 늘어나니 홀드로 2라인 리드를 굳히는 게 안전해요.` },
        { tag: '위험', text: '강제 알까기로 괜한 변수를 만들 바엔 홀드로 판을 닫는 게 좋아요.' },
      ] };
    } else if (winRate >= 0.78 && r.meLineWins >= 2) {
      h = { headline: `홀드 고려 — 승률 ${wp}% (유리)`, factors: [
        { tag: '홀드', text: `2라인을 이기고 있고 승률 ${wp}%로 유리해요. 굳히려면 홀드도 한 방법(아직 확정은 아니라 더 벌려도 됨).` },
      ] };
    } else if (lockLoss) {
      h = { headline: `홀드(확정) — 이 판은 졌어요`, factors: lockLoss.factors };
    } else if (winRate <= 0.1 && dice >= 9) {
      h = { headline: `홀드 권장 — 승률 ${wp}% (거의 졌음)`, factors: [
        { tag: '홀드', text: `승률이 ${wp}%로 매우 낮아요. 더 둘수록 내 주사위가 상대 알까기 표적이 되고 상대에게 쉴드만 더 줘요 — 홀드로 손실을 줄이세요.` },
      ] };
    } else if (winRate <= 0.22 && r.aiLineWins >= 2 && dice >= 9) {
      h = { headline: `홀드 고려 — 승률 ${wp}% (불리)`, factors: [
        { tag: '홀드', text: `상대가 2라인을 이기고 승률 ${wp}%로 불리해요. 역전 가망이 적으면 홀드로 변수를 줄이는 것도 방법(아직 확정 패배는 아님).` },
      ] };
    }
    if (h) hold = { kind: 'hold', headline: h.headline, factors: h.factors };
  }

  ctx.postMessage({ id, winRate, advice, hold });
};
