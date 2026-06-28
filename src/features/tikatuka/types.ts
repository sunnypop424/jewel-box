// 티카투카 보드게임 — 도메인 타입 (React 무관, 순수 데이터 모델).
// 규칙: 3개 라인 × 2개 진영(me/ai) = 6필드, 각 필드 주사위 최대 3개.
// 3개 라인 중 2개 이상에서 합으로 이기면 승리.

export type Owner = 'me' | 'ai';
export type LineIndex = 0 | 1 | 2;
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface Die {
  id: string;
  value: DieValue;
  shield: boolean; // 쉴드 주사위는 밀어내기 불가(영구 고정)
  owner: Owner;
}

export type Field = Die[]; // 길이 0~3

export interface LineState {
  me: Field;
  ai: Field;
}

export interface Board {
  lines: [LineState, LineState, LineState];
}

export type AiLevel = 1 | 2 | 3 | 4 | 5;

// 턴 진행 단계.
// coinToss: 선공 결정 전 / rolling: 턴 시작 자동 굴림 연출 / choosingDie: 타짜로 2개 중 택1
// acting: 굴린 주사위 처리(배치/밀어내기) 대기 / placingShield: 밀어내기로 받은 쉴드 배치 대기
// aiThinking: AI 의사결정 중 / gameOver: 종료
export type Phase =
  | 'coinToss'
  | 'rolling'
  | 'choosingDie'
  | 'acting'
  | 'placingShield'
  | 'aiThinking'
  | 'gameOver';

// 합법수: 굴린 주사위를 어떻게 쓸지.
export type Move =
  | { kind: 'place'; line: LineIndex } // 내 필드에 배치 (비쉴드)
  | { kind: 'push'; line: LineIndex }; // 같은 라인 상대 주사위 밀어내기

// 쉴드 배치 위치 (내/상대 필드 모두 가능).
export interface ShieldPlacement {
  line: LineIndex;
  owner: Owner;
}

export interface LineResult {
  meSum: number;
  aiSum: number;
  winner: Owner | 'tie';
}

export interface ResultDetail {
  lines: [LineResult, LineResult, LineResult];
  meLineWins: number;
  aiLineWins: number;
  meTotal: number; // 전체 라인 내 주사위 총합 (타이브레이커)
  aiTotal: number;
  tikatukaBonus: boolean; // 플레이어가 티카투카 발동 + 승리 시 보너스
  winner: Owner | 'draw';
}

export interface GameState {
  board: Board;
  turn: Owner;
  phase: Phase;
  aiLevel: AiLevel;
  rolledDie: Die | null; // 사용 확정 대상(현재 처리할 주사위)
  rolledChoices: [Die, Die] | null; // 타짜로 둘 굴렸을 때 후보
  pendingShield: Die | null; // 밀어내기로 획득, 배치 대기 중인 쉴드
  tazzaUsed: { me: boolean; ai: boolean }; // 타짜의 손놀림 사용 여부(각 1회)
  held: boolean; // 플레이어 홀드 여부(플레이어 전용 — PvP에선 미사용)
  tikatukaUsed: { me: boolean; ai: boolean }; // 티카투카(베팅) 선언 여부(각 진영 1회, 보너스/차감 판정용)
  tikatukaWindow: number | null; // 베팅 선언 가능 잔여 턴(주사위 10개+ 도달 시 3으로 열리고 턴마다 감소). null=아직 미개방
  pendingFirstShield: Owner | null; // 선공측 첫 주사위는 쉴드로 시작 — 그 첫 굴림에서 소비되면 null
  winner: Owner | 'draw' | null; // 확정된 승자(종료 시)
  result: ResultDetail | null;
  log: string[];
}

// AI 1턴의 원자적 의사결정.
export interface AiDecision {
  useTazza: boolean; // 굴린 주사위가 맘에 안 들면 하나 더(★3+만)
  chooseIndex: 0 | 1; // 타짜 사용 시 어느 굴림을 쓸지
  move: Move; // legalMoves 중 하나(합법성 보장)
  shield: ShieldPlacement | null; // move가 push면 쉴드 배치 위치
}
