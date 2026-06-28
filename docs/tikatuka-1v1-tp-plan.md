# 티카투카 — 1:1 대전 모드 + TP/랭킹 시스템

## Context

현재 티카투카(`src/features/tikatuka/`)는 **AI 단독 대전**만 지원한다. 순수 엔진(`engine.ts`) → 순수 리듀서(`reducer.ts`) → 애니메이션 훅(`useTikatuka.ts`) → UI(`TikatukaGame.tsx`)로 깔끔히 분리돼 있고, 난이도 ★0~★5를 수동 선택한다. Firestore 연동은 전혀 없다.

요청:
1. **1:1 대전 모드** 추가 — Firestore 기반 **온라인 실시간**. 방 생성/참여, 생성·참여 시 디스코드 인원 이름 목록에서 선택 또는 직접 입력.
2. **AI 모드 = 랭크전 + 자유전** 둘 다. 랭크전은 내 TP 레벨에 맞춰 ★를 자동 매칭, 자유전은 기존처럼 ★ 수동 선택(TP 영향 없음).
3. **TP(승점) 제도** 도입 — AI 랭크전 / 1:1 대전 **각각 별도 TP 풀 + 각각 랭킹보드**. 시작 0 TP.
4. TP 규칙은 `룰.PNG` 기준(아래 명세).

플레이어 식별: 앱에 로그인 개념이 없으므로(OAuth는 계획 단계), 티카투카 진입 시 **이름 선택/직접입력**으로 "나"를 정하고 그 이름으로 TP 기록. 마지막 선택은 `localStorage`에 기억.

---

## TP / 레벨 / 매칭 규칙 (룰.PNG + 로아 실제 게임 참고)

### TP 경제 (룰.PNG 그대로)
- 승리 **+200 TP**, 패배 **−100 TP** (TP 최저 0, 음수 없음).
- **2연승 이상** 시 추가 **+100 TP** (연승 보너스).
- 랭크전에서 **★3~★5 상대 승리** 시 추가 보너스: ★3 **+100**, ★4 **+200**, ★5 **+300**.
- **티카투카(베팅)**: 승리 확신 시 선언. 선언 시 **−200 TP 즉시 차감**, 선언 후 승리 시 **+400 TP**. (패배 시 차감분 손실.) 선언 조건: **양 필드 합산 주사위 10개 이상** 배치된 시점부터 **3턴간** 가능. ※ 베팅 TP는 랭크전·1:1 양쪽에 적용.

### 레벨 구간 (로아 실제 게임 인게임 스크린샷에서 추출)
사용자 제공 레벨 스크린샷의 "다음 레벨까지 N TP" 힌트로 역산 → **굵은 값은 확정**, 일부 하위 구간만 추정.
| 레벨 | TP 시작 | 근거 | 랭크전 매칭 ★ |
|---|---|---|---|
| 1 | 0 | (시작) | ★0 |
| 2 | 1,000 | 추정 | ★1 |
| 3 | 2,500 | 추정(3,900 TP가 Lv.3) | ★2 |
| 4 | **5,000** | Lv.3 3,900+1,100 | ★3 |
| 5 | **10,000** | Lv.4 7,000+3,000 | ★3 |
| 6 | **15,000** | Lv.5 11,200+3,800 | ★3 |
| 7 | **25,000** | Lv.6 23,700+1,300 | ★4 |
| 8 | 40,000 | 추정(25k→70k 등분) | ★4 |
| 9 | 55,000 | 추정 | ★5 |
| 10 | **70,000** | 인게임 "최고 레벨" 화면 | ★5 |

- ★ 매핑: 커뮤니티/인게임상 **★3 NPC는 ≈5,000 TP(=Lv.4)부터** 등장 → Lv.4부터 ★3 보너스 대상. 현재 AI 엔진은 ★0~★5 6단계라 10레벨을 6단계에 매핑(상위 레벨일수록 강한 ★). "레벨↑ = 빈틈 덜 허용"은 이 ★ 매핑으로 근사하며, 별도 세분화는 범위 외.
- 위 수치/매핑은 단일 상수 테이블(`tp.ts`)로 두어 추후 조정 용이하게. 추정 구간(Lv.2·3·8·9)은 실데이터 확보 시 이 표만 수정.
- 참고: 인게임 승리 화면 TP 표기(+300~+700)는 베팅·연승·★보너스 합산값으로 보이며, **본 구현의 기본 경제는 사용자가 지정한 `룰.PNG`(승 +200 등)를 따른다.**

---

## 구현 계획

### 1. TP 도메인 로직 (신규 `src/features/tikatuka/tp.ts`)
순수 함수 모듈 (Firestore 무관, 테스트/재사용 용이):
- `LEVEL_TABLE`: 위 구간표.
- `levelForTp(tp): number` (1~10), `starForLevel(level): AiLevel` (랭크 매칭용 ★).
- `tpDelta({ won, streak, rankedStar, tikatukaDeclared }): number` — 룰 경제를 한 곳에 캡슐화. 승/패 기본 ±, 2연승 보너스, ★3~5 보너스, 베팅 ±200/+400 합산.
- `nextStreak(prevStreak, won): number`.

### 2. 플레이어 TP 영속 (`src/firebaseApi.ts` 확장)
기존 패턴(getDoc/setDoc/updateDoc, `db` 사용) 그대로 따른다.
- 컬렉션 `tikatukaPlayers/{name}` 문서:
  ```ts
  interface TikatukaPlayer {
    name: string;
    tpAi: number; streakAi: number;        // 랭크전 풀
    tpPvp: number; streakPvp: number;      // 1:1 대전 풀
    winsAi: number; lossesAi: number;
    winsPvp: number; lossesPvp: number;
    updatedAt: string;
  }
  ```
- `fetchTikatukaPlayer(name)`, `fetchTikatukaLeaderboard()` (전체 read 후 클라에서 tpAi / tpPvp 기준 정렬 → 두 보드), `applyTikatukaResult(name, mode, { won, ... })` — 트랜잭션으로 현재 값 읽고 `tpDelta`/`nextStreak` 적용 후 기록.
- `db`는 `ignoreUndefinedProperties: true`이므로 선택 필드 생략 가능.

### 3. 모드 선택 허브 + 라우팅
- 기존 `/tikatuka`(게임), `/tikatuka-sim`(시뮬) 유지. `/tikatuka`를 **모드 허브**로 재구성: ① 랭크전(AI) ② 자유전(AI) ③ 1:1 대전 ④ 랭킹보드.
- 신규 화면 컴포넌트(같은 폴더):
  - `TikatukaHub.tsx` — 이름 선택/입력(디스코드 인원 목록 = `App.tsx`의 `effectiveCharacters`에서 유니크 `discordName` 도출, 재사용) + 모드 카드.
  - `TikatukaLeaderboard.tsx` — AI/1:1 탭 2개 랭킹보드.
- 이름 목록: `App.tsx`에서 `allUserNames` 형태로 도출되는 패턴을 허브에 전달(props) — 새 fetch 불필요.

### 4. AI 모드: 랭크전 vs 자유전
- 기존 `TikatukaGame.tsx`는 거의 그대로 재사용. props로 모드 주입:
  - **자유전**: 지금처럼 ★ 수동 선택, 게임 종료 시 TP 미반영.
  - **랭크전**: 난이도 선택 화면 숨김 → `starForLevel(levelForTp(player.tpAi))`로 ★ 자동 결정. 종료 시 `applyTikatukaResult(name,'ai',...)` 호출, 결과 화면에 TP 변동/레벨 표시. **진행 중 게임은 매 수마다 Firestore에 영속(아래 이탈 처리)**.
- 베팅(티카투카) 선언 UI는 양 모드 공통. 현재 `tikatukaUsed` 플래그 + `ResultDetail.tikatukaBonus`가 있으므로, 선언 가능 조건(주사위 10개+/3턴)과 −200 차감을 reducer/엔진에 보강 필요(아래 5의 조건 로직과 별개로 AI전에도 적용).

### 5. 1:1 온라인 실시간 대전 (핵심·최난도)
순수 엔진/리듀서는 **그대로 재사용**하고, 온라인 동기화 레이어를 새로 얹는다.

**원칙**: 리듀서가 결정적(주사위 값은 행동 시 클라가 뽑아 상태에 박음)이므로 **공유 RNG 불필요** — 행동한 클라가 난수를 확정해 상태에 기록하면 양쪽이 동일 상태를 본다.

**관점(perspective) 처리**: 엔진은 `Owner='me'|'ai'`. 방의 정식(canonical) 상태는 **host 관점**(`me`=host, `ai`=guest)으로 저장. guest 클라는 수신한 상태를 `flipState`(라인별 me↔ai, turn, owner 뒤집기)로 변환해 UI에 먹이고, 자신의 액션은 `flipAction`으로 되돌려 기록. → 엔진/리듀서/대부분 UI 무수정.

**신규 파일**:
- `online/room.ts` — Firestore 방 문서 스키마 & API (방 코드 생성/조회/참여/상태쓰기/onSnapshot 구독). 컬렉션 `tikatukaRooms/{code}`:
  ```ts
  interface TikatukaRoom {
    code: string;
    host: { name: string };
    guest: { name: string } | null;
    status: 'waiting' | 'playing' | 'finished' | 'abandoned';
    state: SerializedGameState | null;   // host 관점 canonical
    seq: number;                          // 단조 증가(경합 방지/순서 보장)
    turnSeat: 'host' | 'guest';
    heartbeat: { host: number; guest: number }; // 각 클라가 ~5s마다 갱신(이탈 감지)
    createdAt: string; updatedAt: string;
    result?: { winnerSeat: 'host'|'guest'|'draw'; reason: 'normal'|'forfeit' };
    tpApplied?: boolean;                  // TP 이중반영 방지 가드
  }
  ```
- `online/perspective.ts` — `flipState`, `flipAction` 순수 유틸.
- `useTikatukaOnline.ts` — `useTikatuka`와 동일한 외부 API(state, start, place, push, hold, tazza, tikatuka, placeShield)를 노출하되, 내부는 ① onSnapshot 구독으로 원격 상태 수신 ② 내 턴일 때만 액션 허용 → 로컬 reducer로 다음 상태 산출 → `seq+1`과 함께 방 문서에 write. AI 자동턴 타이머 로직은 제거(상대가 사람).
- `TikatukaPvp.tsx` — 방 생성/참여 화면(이름 + 코드) + 대기 로비 + 게임(보드는 기존 `Board.tsx` 재사용, 상대 라벨을 ★ 대신 상대 이름으로).

**라이프사이클**:
1. 생성: 코드 생성 → `status:'waiting'`, host 이름 기록.
2. 참여: 코드로 조회 → guest 이름 기록, 선공 코인토스 후 `status:'playing'`, 초기 `state` 작성.
3. 진행: 턴 클라만 write. 비턴 클라는 수신 상태를 flip 후 표시 + 도착 모션(간단히).
4. 종료: 게임을 끝낸 액션을 쓴 클라가 `status:'finished'`, `result`, `tpApplied:true`로 기록하면서 **양쪽 TP를 한 트랜잭션에서 함께 반영**(아래 "TP 반영 주체" 참조). 상대 클라는 `finished`를 수신만 하고 TP write 안 함.

**경합/안전**: write는 트랜잭션으로 `seq` 검증(받은 seq보다 큰 것만 반영)해 더블쓰기 방지. 한 클라가 자기 턴 아닐 때 액션 시도하면 무시.

**TP 반영 주체(이중반영 방지)**: PvP는 두 클라가 같은 결과를 보므로, **종료 상태를 write하는 클라 한 쪽이 `tpApplied` 가드 아래 양쪽 `tikatukaPlayers` 문서를 트랜잭션으로 동시 갱신**한다. 이렇게 하면 이탈한 패자도 다시 안 들어와도 패배(−100·연승 초기화)가 확정된다.

### 5.5 이탈 / 연결 끊김 처리 (새로고침·인터넷 유실·강제 종료)

핵심 원칙: **새로고침·일시 끊김 = 재접속으로 복구 가능, 단 도망쳐서 패배를 회피할 수는 없다.** TP는 항상 한쪽 권위 클라가 가드(`tpApplied`) 아래 기록하므로 이탈자도 결과를 피하지 못한다.

**AI 랭크전 (단일 플레이어 — 새로고침/이탈)**
- 랭크 게임 시작 시 진행 상태를 `tikatukaPlayers/{name}.activeRanked = { state, star, startedAt }`로 저장하고, **매 수마다 갱신**. 정상 종료 시 `applyTikatukaResult` 후 `activeRanked` 삭제.
- 재진입(새로고침/재접속) 시 `activeRanked`가 남아 있으면 → **그 게임을 그대로 이어서 진행**(상태 복원). 새 랭크 게임은 미완 게임이 있으면 시작 불가.
- 미완 게임을 버리는 유일한 출구는 명시적 **"기권"**(= 패배: −100·연승 초기화). 즉 "지는 중에 새로고침" 해도 결과 화면 대신 같은 판이 다시 떠서 회피 불가.
- 자유전은 TP 무관이라 영속 없음(새로고침 = 그냥 새 판).

**1:1 PvP (양 플레이어 — 끊김/새로고침/강제 종료)**
- **재접속**: 방 코드를 `localStorage`에 저장. 정식 `state`가 Firestore에 있으므로, 끊겼다 돌아오면 같은 방의 canonical 상태에서 **이어서 플레이**(끊김 ≠ 즉시 패배).
- **하트비트**: 각 클라가 방에 머무는 동안 `heartbeat[seat]`를 ~5s마다 갱신(+ `visibilitychange`/`beforeunload` 시 갱신). 상대 하트비트가 **유예시간(예: 30~45s) 초과**로 stale → 현재 클라가 "상대 연결 끊김" 표시 후, 초과가 지속되면 **상대 이탈 승리**로 `status:'finished', result:{winnerSeat:나, reason:'forfeit'}` write + 양쪽 TP 반영.
- **명시적 "나가기"**: 즉시 forfeit(나가는 사람 패배, 상대 승리). `beforeunload`에서 best-effort로 heartbeat를 비워 상대 감지를 앞당김(보장은 하트비트 타임아웃이 담당).
- **둘 다 이탈**: 아무도 forfeit를 write하지 못하면 방은 stale로 남음 → PvP 진입 시 오래된 `playing`/`waiting` 방을 `abandoned`로 정리(TP 변동 없음). 양쪽이 동시에 사라진 경우만 무승부 처리이며, 한쪽이라도 남아 있으면 위 forfeit로 패배가 확정됨.
- **턴 타임아웃(선택)**: 인게임처럼 턴 제한시간(예: 30s)을 두고 초과 시 자동 홀드/패스 처리 — 범위에 넣을지는 구현 시 판단(이탈 처리와 독립).

유예시간·하트비트 주기는 `tp.ts`/room 모듈 상수로 두어 조정 가능하게 한다.

### 6. App / 네비 연동
- `App.tsx`: 신규 라우트 추가(`/tikatuka` 허브, `/tikatuka/ranked`, `/tikatuka/free`, `/tikatuka/pvp`, `/tikatuka/leaderboard` 등 — 또는 허브 내부 상태 전환으로 라우트 최소화). 사이드바/네비 라벨 한국어 유지.
- 이름 목록 props 전달(위 3).
- 리디자인 진행 중이므로(plan: dapper-floating-seal) 새 UI는 `src/ds/` 프리미티브 + 시맨틱 토큰 클래스 우선 사용, `dark:` 남발 지양.

---

## 신규/수정 파일 요약
**신규**: `src/features/tikatuka/tp.ts`, `online/room.ts`, `online/perspective.ts`, `useTikatukaOnline.ts`, `TikatukaHub.tsx`, `TikatukaPvp.tsx`, `TikatukaLeaderboard.tsx`.
**수정**: `src/firebaseApi.ts`(TP/방 API), `TikatukaGame.tsx`(랭크/자유 모드 props + 종료 시 TP 반영), `reducer.ts`/`engine.ts`(티카투카 베팅 선언 조건·−200 차감 보강), `types.ts`(베팅/연승 관련 필드 보강), `App.tsx`(라우트·네비·이름목록 전달).
**무수정 재사용**: `Board.tsx`, `DiceTray.tsx`, `DiePip.tsx`, `ai.ts`(랭크 ★ 매핑에 그대로 사용).

## 미해결/주의
- **Firestore 보안 규칙**: 신규 컬렉션(`tikatukaPlayers`, `tikatukaRooms`) write 권한 확인 필요. (현재 규칙이 개방형인지 점검.)
- **TP 도용 방지 없음**: 로그인 없는 이름 기반이라 누구나 임의 이름으로 기록 가능 — 친목 채널 전제로 수용(OAuth 도입 시 강화).
- 베팅 로직을 reducer에 넣을 때 기존 `tikatukaUsed`/`tikatukaBonus` 의미를 "−200 차감 + 조건부 +400"로 정합화 — AI전/1:1 공통.

## 검증
1. `npm run dev`(포트 5177)로 구동.
2. **자유전**: ★ 선택 → 1판 → TP 미변동 확인.
3. **랭크전**: 새 이름 0 TP → 승리 시 +200(레벨/★ 매칭 표시), 2연승 시 +100, 패배 −100, 베팅 선언(주사위 10개+) 후 승리 +400/−200 검증. 랭킹보드 AI 탭 반영.
4. **1:1**: 두 브라우저(또는 시크릿창)에서 한쪽 방 생성→코드 공유→참여→교대 플레이가 실시간 동기화되는지, 종료 후 양쪽 tpPvp 반영 + 1:1 랭킹보드 노출 확인.
5. **이탈 처리**:
   - 랭크전 진행 중 새로고침 → 같은 판이 복원되어 이어짐(회피 불가), "기권" → 패배(−100) 반영 확인.
   - PvP 한쪽 새로고침 → 재접속으로 같은 판 복원. 한쪽 탭을 닫고 유예시간 경과 → 남은 쪽이 forfeit 승리로 종료, 양쪽 TP(승/패) 반영, `tpApplied`로 이중반영 없음 확인.
6. `npx eslint .` 통과.
