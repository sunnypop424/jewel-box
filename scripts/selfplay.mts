// 티카투카 자가대국 — 양측 모두 시뮬 '추천 로직'(recommendMove/Choose/Shield)으로 둔다. 게임모드 AI(decideAi)는 미사용.
// 각 판마다: 경기 내역(수 순서) + 그 판의 실측 행동 + 이상치(거른 알까기·어긋난 쉴드)와 원인 추정을 기록(JSONL).
// 사용법: npx tsx scripts/selfplay.mts [games]
import { writeFileSync } from 'node:fs';
import {
  applyPush,
  canPush,
  createEmptyBoard,
  evaluate,
  isBoardFull,
  makeDie,
  opponentOf,
  placeDie,
  rollValue,
  rollValueExcluding,
} from '../src/features/tikatuka/engine';
import { recommendMove, recommendChoose, recommendShield } from '../src/features/tikatuka/ai';
import type { AdvCfg } from '../src/features/tikatuka/ai';
import type { Board, DieValue, LineIndex, Owner } from '../src/features/tikatuka/types';

const LINES = [0, 1, 2] as const;
const rng = Math.random;
const CFG: AdvCfg = { playouts: 10, respLevel: 2, rolloutLevel: 2, expandShield: false, oppPushFirst: true };
const OUT = 'scripts/selfplay_games.jsonl';

const pushAvail = (b: Board, o: Owner, v: DieValue) => LINES.some((l) => canPush(b, l, o, v));

interface MoveEv {
  seq: number; actor: Owner; roll: DieValue; tazza?: [DieValue, DieValue];
  action: 'place' | 'push'; line: LineIndex; shield?: { value: DieValue; line: LineIndex; owner: Owner };
}
interface Anom { seq: number; actor: Owner; type: string; cause: string }

// 한 진영(추천) 한 턴. 보드 갱신 + 이 수의 기록/이상치 판정에 필요한 정보 반환.
function advisorTurn(board: Board, owner: Owner, iAmFirst: boolean, tazzaAvail: boolean, isFirstShield: boolean) {
  const ctx = { iAmFirst, isFirstShield };
  const v1 = rollValue(rng);
  let adv = recommendMove(board, owner, v1, tazzaAvail, CFG, ctx);
  if (!adv) return { board, passed: true as const };
  let value: DieValue = v1;
  let tazza: [DieValue, DieValue] | undefined;
  if (adv.action === 'tazza') {
    const v2 = rollValueExcluding(rng, v1);
    const ch = recommendChoose(board, owner, [v1, v2], CFG);
    value = ([v1, v2] as DieValue[])[ch.index];
    tazza = [v1, v2];
    adv = recommendMove(board, owner, value, false, CFG, ctx);
    if (!adv) return { board, passed: true as const };
  }
  const pushWasAvail = pushAvail(board, owner, value);
  if (adv.action === 'place') {
    const b = placeDie(board, adv.line!, owner, makeDie(value, owner, isFirstShield));
    return { board: b, passed: false as const, roll: value, tazza, action: 'place' as const, line: adv.line!, pushWasAvail };
  }
  // push → 쉴드
  const line = adv.line!;
  const ownHadThree = board.lines[line][owner].some((d) => d.value === 3); // 값3 페어 판정용(자기 라인)
  let b = applyPush(board, line, owner, value).board;
  const sv = rollValue(rng);
  const sp = recommendShield(b, owner, sv);
  let shield: MoveEv['shield'];
  if (sp) {
    b = placeDie(b, sp.line, sp.owner, makeDie(sv, owner, true));
    const pairThree = sv === 3 && sp.owner === owner && b.lines[sp.line][owner].filter((d) => d.value === 3).length >= 2;
    shield = { value: sv, line: sp.line, owner: sp.owner };
    (shield as { pair3?: boolean }).pair3 = pairThree;
    void ownHadThree;
  }
  return { board: b, passed: false as const, roll: value, tazza, action: 'push' as const, line, shield, pushWasAvail };
}

function playGame(firstTurn: Owner) {
  let board = createEmptyBoard();
  let pendingFirstShield: Owner | null = firstTurn;
  const tazzaHeld: Record<Owner, boolean> = { me: true, ai: true };
  const events: MoveEv[] = [];
  const anomalies: Anom[] = [];
  const st = { pushTaken: 0, pushAvail: 0, tazza: 0 };
  let turn = firstTurn;
  let turns = 0; let idle = 0; let seq = 0;
  while (!isBoardFull(board) && turns < 200 && idle < 2) {
    const isFS = pendingFirstShield === turn;
    const r = advisorTurn(board, turn, firstTurn === turn, tazzaHeld[turn], isFS);
    if (r.passed) { idle++; turn = opponentOf(turn); turns++; continue; }
    idle = 0; board = r.board;
    const ev: MoveEv = { seq, actor: turn, roll: r.roll!, tazza: r.tazza, action: r.action!, line: r.line!, shield: r.shield };
    events.push(ev);
    // 통계
    if (r.pushWasAvail) { st.pushAvail++; if (r.action === 'push') st.pushTaken++; }
    if (r.tazza) { st.tazza++; tazzaHeld[turn] = false; }
    // 이상치 판정 + 원인 추정
    if (r.pushWasAvail && r.action === 'place')
      anomalies.push({ seq, actor: turn, type: 'declined-push', cause: `굴림 ${r.roll} 알까기 가능했으나 ${r.line! + 1}번 배치 — 추천 승률상 놓기 우세(단일/저점 청소보다 2라인·라인강화 가치 큼)` });
    if (r.action === 'push' && r.shield) {
      const sh = r.shield as { value: DieValue; owner: Owner; pair3?: boolean };
      if (sh.value <= 3 && sh.owner === turn)
        anomalies.push({ seq, actor: turn, type: 'shield-own-low', cause: sh.pair3 ? `값3을 자기 라인 3과 페어(9점) — 캡보다 페어 우선(실측 ★3 동일)` : `저눈 ${sh.value}를 자기 필드에 — 상대 캡 자리 부족 등` });
      else if (sh.value >= 4 && sh.owner !== turn)
        anomalies.push({ seq, actor: turn, type: 'shield-opp-high', cause: `고눈 ${sh.value}를 상대 캡에(이례적 — 접전 라인 봉쇄 우선 판단)` });
    }
    if (isFS) pendingFirstShield = null;
    seq++; turn = opponentOf(turn); turns++;
  }
  const r = evaluate(board, false);
  const byTiebreak = r.winner !== 'draw' && r.meLineWins < 2 && r.aiLineWins < 2;
  const dice = LINES.reduce((n, l) => n + board.lines[l].me.length + board.lines[l].ai.length, 0);
  // 이 판이 보여준 대응 규칙(이상치에서 도출).
  const ruleSet = new Set<string>();
  for (const a of anomalies) {
    if (a.type === 'declined-push') ruleSet.add('단일 저점 청소보다 2라인 확정·라인 강화 배치를 우선');
    else if (a.type === 'shield-own-low') ruleSet.add('값3 쉴드는 자기 라인 3과 페어(9점)로 — 캡보다 우선');
    else if (a.type === 'shield-opp-high') ruleSet.add('고눈 쉴드는 자기 강화가 원칙(접전 라인 봉쇄 시만 예외)');
  }
  return { firstTurn, winner: r.winner, byTiebreak, lineWins: [r.meLineWins, r.aiLineWins], totals: [r.meTotal, r.aiTotal], turns, dice, behavior: st, anomalies, rules: [...ruleSet], events };
}

const N = Number(process.argv[2] ?? 3000);
const t0 = Date.now();
const agg = { meWin: 0, aiWin: 0, draw: 0, firstWin: 0, tiebreak: 0, pushTaken: 0, pushAvail: 0, tazzaUses: 0, tazzaGames: 0, dice: 0, turns: 0, declinedPush: 0, shieldOwnLow: 0, shieldOppHigh: 0 };
const lines: string[] = [];
for (let i = 0; i < N; i++) {
  const firstTurn: Owner = i % 2 === 0 ? 'me' : 'ai';
  const g = playGame(firstTurn);
  if (g.winner === 'me') agg.meWin++; else if (g.winner === 'ai') agg.aiWin++; else agg.draw++;
  if (g.winner !== 'draw' && g.winner === firstTurn) agg.firstWin++;
  if (g.byTiebreak) agg.tiebreak++;
  agg.pushTaken += g.behavior.pushTaken; agg.pushAvail += g.behavior.pushAvail;
  agg.tazzaUses += g.behavior.tazza; if (g.behavior.tazza > 0) agg.tazzaGames++;
  agg.dice += g.dice; agg.turns += g.turns;
  for (const a of g.anomalies) { if (a.type === 'declined-push') agg.declinedPush++; else if (a.type === 'shield-own-low') agg.shieldOwnLow++; else agg.shieldOppHigh++; }
  lines.push(JSON.stringify({ game: i, ...g }));
}
writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

const pc = (x: number, d: number) => (d > 0 ? `${((100 * x) / d).toFixed(1)}%` : '—');
const dec = agg.meWin + agg.aiWin;
console.log(`\n## 추천 vs 추천 (양측 동일 정책)  n=${N}, cfg playouts=${CFG.playouts}`);
console.log(`선공A승 ${agg.meWin} (${pc(agg.meWin, N)}) · 후공B승 ${agg.aiWin} (${pc(agg.aiWin, N)}) · 무 ${agg.draw} (${pc(agg.draw, N)})`);
console.log(`선공 승률(무 제외) ${pc(agg.firstWin, dec)}`);
console.log(`타이브레이커 결판 ${pc(agg.tiebreak, N)} · 평균 주사위 ${(agg.dice / N).toFixed(1)} · 평균 턴 ${(agg.turns / N).toFixed(1)}`);
console.log(`알까기율(가능 시) ${pc(agg.pushTaken, agg.pushAvail)} (${agg.pushTaken}/${agg.pushAvail})`);
console.log(`타짜: 사용 게임 ${pc(agg.tazzaGames, N)} · 총 ${agg.tazzaUses}회`);
console.log(`이상치: 거른알까기 ${agg.declinedPush} · 저눈쉴드자기(주로 값3페어) ${agg.shieldOwnLow} · 고눈쉴드상대 ${agg.shieldOppHigh}`);
console.log(`\n경기 내역 저장: ${OUT} (${N}줄)`);
console.log(`총 ${N}판 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
