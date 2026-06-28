// 시뮬 전용 추천 워커 — 메인 스레드를 막지 않고 깊은 탐색으로 최선 수 + 정밀 승률을 계산한다.
//  · 끝까지 롤아웃: ★4(1-step EV) / 상대 즉답: ★5(MC) / 얻는 쉴드: 1~6 전수. (★5를 롤아웃에 중첩하는 건 불가 → 즉답 ply에서만)
//  · 승률: 닫힌형 근사가 아니라 현재 보드에서 끝까지 MC로 직접 추정(현재 턴부터).
import { recommendMove, recommendChoose, recommendShield, mcWinRate } from './ai';
import type { AdvCfg, Factor } from './ai';
import type { Board, DieValue, Owner, LineIndex } from './types';

const ctx = self as unknown as Worker;

// 시뮬 깊은 탐색 설정. 무거우니 playouts는 작게(근거리 전수 전개가 분산을 줄여 적은 표본으로도 안정).
const CFG: AdvCfg = { playouts: 150, respLevel: 5, rolloutLevel: 4, expandShield: true };
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

  // 정밀 승률 — 현재 턴부터 끝까지 MC.
  const winRate = mcWinRate(board, 'me', turn, WR_PLAYOUTS, WR_LEVEL);

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
    const a = recommendChoose(board, 'me', [advReq.value, advReq.value2], CFG);
    advice = { kind: 'choose', headline: a.headline, factors: a.factors, chooseIndex: a.index };
  } else if (advReq?.kind === 'shield') {
    const a = recommendShield(board, 'me', advReq.value);
    if (a) advice = { kind: 'shield', headline: a.headline, factors: a.factors, line: a.line, side: a.owner };
  }

  ctx.postMessage({ id, winRate, advice });
};
