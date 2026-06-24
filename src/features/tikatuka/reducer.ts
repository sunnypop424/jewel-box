// 티카투카 reducer — 순수 (state, action) => state. 난수는 액션 payload로 주입.
// 종료/턴전환은 advanceTurn 단일 지점에 캡슐화(홀드 시 AI 필드 충원 / 아니면 6필드 충원).

import {
  applyPush,
  createEmptyBoard,
  evaluate,
  isTerminal,
  makeDie,
  opponentOf,
  placeDie,
} from './engine';
import type { AiTurn } from './ai';
import type {
  AiLevel,
  Board,
  DieValue,
  GameState,
  LineIndex,
  Owner,
} from './types';

export type Action =
  | { type: 'START'; aiLevel: AiLevel; firstTurn: Owner }
  | { type: 'ROLL'; die: { value: DieValue } } // 플레이어 자동 굴림
  | { type: 'USE_TAZZA'; die: { value: DieValue } } // 즉시 추가 굴림
  | { type: 'CHOOSE_DIE'; index: 0 | 1 }
  | { type: 'PLACE'; line: LineIndex }
  | { type: 'PUSH'; line: LineIndex; shieldValue: DieValue }
  | { type: 'PLACE_SHIELD'; line: LineIndex; owner: Owner }
  | { type: 'HOLD' }
  | { type: 'TIKATUKA' }
  | { type: 'AI_TURN'; turn: AiTurn }
  | { type: 'AI_PUSH'; turn: AiTurn } // AI 밀어내기만 적용 → 쉴드는 트레이 대기(placingShield, 턴 유지)
  | { type: 'AUTO_HOLD' } // 합법수 없음 → 패스
  | { type: 'RESET' }; // 난이도 선택 화면으로

const LINE_LABEL = ['1번', '2번', '3번'];

export function initialState(aiLevel: AiLevel = 2): GameState {
  return {
    board: createEmptyBoard(),
    turn: 'me',
    phase: 'coinToss',
    aiLevel,
    rolledDie: null,
    rolledChoices: null,
    pendingShield: null,
    tazzaUsed: { me: false, ai: false },
    held: false,
    tikatukaUsed: false,
    pendingFirstShield: null,
    winner: null,
    result: null,
    log: [],
  };
}

function log(s: GameState, msg: string): string[] {
  return [...s.log, msg].slice(-40);
}

// 종료 체크 + 다음 턴 세팅(단일 지점).
function advanceTurn(s: GameState, board: Board, extraLog: string[]): GameState {
  if (isTerminal(board, s.held)) {
    const result = evaluate(board, s.tikatukaUsed);
    return {
      ...s,
      board,
      phase: 'gameOver',
      winner: result.winner,
      result,
      rolledDie: null,
      rolledChoices: null,
      pendingShield: null,
      log: [...extraLog, '게임 종료'].slice(-40),
    };
  }
  let nextTurn = opponentOf(s.turn);
  if (s.held && nextTurn === 'me') nextTurn = 'ai'; // 홀드한 플레이어는 더 안 던짐
  return {
    ...s,
    board,
    turn: nextTurn,
    phase: nextTurn === 'me' ? 'rolling' : 'aiThinking',
    rolledDie: null,
    rolledChoices: null,
    pendingShield: null,
    log: extraLog,
  };
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'RESET':
      return initialState(state.aiLevel);

    case 'START':
      return {
        ...initialState(action.aiLevel),
        turn: action.firstTurn,
        phase: action.firstTurn === 'me' ? 'rolling' : 'aiThinking',
        // 선공측은 첫 주사위를 쉴드 주사위로 시작(첫 턴엔 보드가 비어 밀어내기 불가 → 자기 필드에 보호된 주사위로 배치).
        pendingFirstShield: action.firstTurn,
        log: [
          `${action.firstTurn === 'me' ? '선공: 나' : '선공: 컴퓨터'} (★${action.aiLevel})`,
          `${action.firstTurn === 'me' ? '나' : '컴퓨터'}의 첫 주사위는 쉴드로 시작`,
        ],
      };

    case 'ROLL': {
      if (state.phase !== 'rolling' || state.turn !== 'me') return state;
      const asShield = state.pendingFirstShield === 'me'; // 선공(나)의 첫 굴림 → 쉴드 주사위
      const die = makeDie(action.die.value, 'me', asShield);
      return {
        ...state,
        rolledDie: die,
        rolledChoices: null,
        phase: 'acting',
        pendingFirstShield: asShield ? null : state.pendingFirstShield,
        log: log(state, `내 굴림: ${action.die.value}${asShield ? ' (쉴드)' : ''}`),
      };
    }

    case 'USE_TAZZA': {
      if (state.phase !== 'acting' || state.turn !== 'me') return state;
      if (state.tazzaUsed.me || state.winner !== null || !state.rolledDie) return state;
      const second = makeDie(action.die.value, 'me', false);
      return {
        ...state,
        rolledChoices: [state.rolledDie, second],
        phase: 'choosingDie',
        tazzaUsed: { ...state.tazzaUsed, me: true },
        log: log(state, `타짜의 손놀림! 추가 굴림: ${action.die.value}`),
      };
    }

    case 'CHOOSE_DIE': {
      if (state.phase !== 'choosingDie' || !state.rolledChoices) return state;
      const die = state.rolledChoices[action.index];
      return {
        ...state,
        rolledDie: die,
        rolledChoices: null,
        phase: 'acting',
        log: log(state, `선택: ${die.value}`),
      };
    }

    case 'PLACE': {
      if (state.phase !== 'acting' || state.turn !== 'me' || !state.rolledDie) return state;
      const board = placeDie(state.board, action.line, 'me', state.rolledDie);
      return advanceTurn(
        state,
        board,
        log(state, `${LINE_LABEL[action.line]} 라인 내 필드에 ${state.rolledDie.value} 배치`)
      );
    }

    case 'PUSH': {
      if (state.phase !== 'acting' || state.turn !== 'me' || !state.rolledDie) return state;
      const { board, removedCount } = applyPush(state.board, action.line, 'me', state.rolledDie.value);
      const shield = makeDie(action.shieldValue, 'me', true);
      return {
        ...state,
        board,
        pendingShield: shield,
        phase: 'placingShield',
        rolledDie: null,
        log: log(
          state,
          `${LINE_LABEL[action.line]} 라인에서 ${state.rolledDie.value} ${removedCount}개 밀어냄 → 쉴드 ${action.shieldValue} 획득`
        ),
      };
    }

    case 'PLACE_SHIELD': {
      if (state.phase !== 'placingShield' || !state.pendingShield) return state;
      const board = placeDie(state.board, action.line, action.owner, state.pendingShield);
      return advanceTurn(
        state,
        board,
        log(
          state,
          `쉴드 ${state.pendingShield.value}을(를) ${action.owner === 'me' ? '내' : '상대'} ${LINE_LABEL[action.line]} 라인에 배치`
        )
      );
    }

    case 'HOLD': {
      if (state.turn !== 'me' || state.winner !== null) return state;
      if (state.phase !== 'acting' && state.phase !== 'rolling') return state;
      const held: GameState = { ...state, held: true };
      return advanceTurn(held, state.board, log(state, '홀드 — 나는 더 던지지 않음'));
    }

    case 'TIKATUKA': {
      if (state.turn !== 'me' || state.winner !== null || state.tikatukaUsed) return state;
      if (state.phase === 'gameOver' || state.phase === 'coinToss') return state;
      return { ...state, tikatukaUsed: true, log: log(state, '티카투카! (승리 시 보너스)') };
    }

    case 'AI_PUSH': {
      // AI 밀어내기만 적용하고, 쉴드는 트레이에 대기시킨 채 턴을 AI로 유지(배치는 PLACE_SHIELD로 별도).
      if (state.phase !== 'aiThinking' || state.turn !== 'ai') return state;
      const t = action.turn;
      if (t.move.kind !== 'push' || t.shieldValue == null) return state;
      const { board, removedCount } = applyPush(state.board, t.move.line, 'ai', t.chosenValue);
      const shield = makeDie(t.shieldValue, 'ai', true);
      const withTazza: GameState = t.usedTazza
        ? { ...state, tazzaUsed: { ...state.tazzaUsed, ai: true } }
        : state;
      let lines = [...state.log, `컴퓨터 굴림: ${t.rolls.join(' → ')}${t.usedTazza ? ' (타짜)' : ''}`];
      lines = [
        ...lines,
        `컴퓨터: ${LINE_LABEL[t.move.line]} 라인 ${t.chosenValue} ${removedCount}개 밀어냄 → 쉴드 ${t.shieldValue} 획득`,
      ];
      return {
        ...withTazza,
        board,
        pendingShield: shield,
        phase: 'placingShield',
        rolledDie: null,
        rolledChoices: null,
        log: lines.slice(-40),
      };
    }

    case 'AUTO_HOLD': {
      // 합법수 없음 → 이번 턴만 패스(일시적). held는 건드리지 않는다.
      // 영구 정지는 오직 수동 HOLD에서만 발생 — 이후 상대가 밀어내 빈칸이 생기면 정상 복귀.
      return advanceTurn(
        state,
        state.board,
        log(state, `${state.turn === 'me' ? '나' : '컴퓨터'}: 둘 곳이 없어 자동 패스`)
      );
    }

    case 'AI_TURN': {
      if (state.phase !== 'aiThinking' || state.turn !== 'ai') return state;
      const t = action.turn;
      let lines = state.log;
      lines = [...lines, `컴퓨터 굴림: ${t.rolls.join(' → ')}${t.usedTazza ? ' (타짜)' : ''}`];

      // 선공(컴퓨터)의 첫 주사위 → 쉴드로 배치(첫 턴은 보드가 비어 밀어내기가 없으므로 배치만 가능).
      const aiFirstShield = state.pendingFirstShield === 'ai';

      let board: Board;
      if (t.move.kind === 'place') {
        board = placeDie(state.board, t.move.line, 'ai', makeDie(t.chosenValue, 'ai', aiFirstShield));
        lines = [...lines, `컴퓨터: ${LINE_LABEL[t.move.line]} 라인에 ${t.chosenValue} 배치${aiFirstShield ? ' (쉴드)' : ''}`];
      } else {
        const res = applyPush(state.board, t.move.line, 'ai', t.chosenValue);
        board = res.board;
        lines = [...lines, `컴퓨터: ${LINE_LABEL[t.move.line]} 라인 ${t.chosenValue} ${res.removedCount}개 밀어냄`];
        if (t.shieldPlacement && t.shieldValue != null) {
          board = placeDie(
            board,
            t.shieldPlacement.line,
            t.shieldPlacement.owner,
            makeDie(t.shieldValue, 'ai', true)
          );
          lines = [
            ...lines,
            `컴퓨터: 쉴드 ${t.shieldValue}을(를) ${t.shieldPlacement.owner === 'me' ? '내' : '자기'} ${LINE_LABEL[t.shieldPlacement.line]} 라인에 배치`,
          ];
        }
      }

      const base: GameState = aiFirstShield ? { ...state, pendingFirstShield: null } : state;
      const withTazza: GameState = t.usedTazza
        ? { ...base, tazzaUsed: { ...base.tazzaUsed, ai: true } }
        : base;
      return advanceTurn(withTazza, board, lines.slice(-40));
    }

    default:
      return state;
  }
}
