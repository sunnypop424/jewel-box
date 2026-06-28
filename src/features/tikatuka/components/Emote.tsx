// 감정표현(이모티콘) — PvP·자유전 공용 팔레트 + UI. 디자인을 한 곳에 두어 양쪽 일치 보장.
import { useState } from 'react';
import { Smile } from 'lucide-react';

// 팔레트 — 이 배열이 곧 보낼 수 있는 감정표현의 단일 출처(EmoteKind도 여기서 파생).
export const EMOTES = [
  { kind: 'thumbsUp', emoji: '👍', label: '엄지척' },
  { kind: 'thumbsDown', emoji: '👎', label: '엄지다운' },
  { kind: 'heart', emoji: '❤️', label: '하트' },
  { kind: 'clap', emoji: '👏', label: '박수' },
  { kind: 'laugh', emoji: '😂', label: '웃음' },
  { kind: 'taunt', emoji: '😜', label: '도발' },
  { kind: 'surprised', emoji: '😲', label: '놀람' },
  { kind: 'sad', emoji: '😢', label: '슬퍼요' },
  { kind: 'cry', emoji: '😭', label: '펑펑울기' },
  { kind: 'angry', emoji: '😡', label: '화남' },
] as const;

export type EmoteKind = (typeof EMOTES)[number]['kind'];

export interface EmoteState {
  kind: EmoteKind;
  n: number; // 변화 감지/연출 재시작용 nonce
}

function emojiFor(kind: EmoteKind): string {
  return EMOTES.find((e) => e.kind === kind)?.emoji ?? '';
}

// 피커 — 감정표현 버튼 + 이모지 그리드 팝오버. 이모지 클릭 시 onSend(kind) 후 닫힘.
export function EmotePicker({ onSend, disabled }: { onSend: (kind: EmoteKind) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="감정표현 보내기"
        className={`inline-flex shrink-0 touch-manipulation select-none items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          open ? 'bg-indigo-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
        }`}
      >
        <Smile size={12} /> 감정표현
      </button>
      {open && (
        <>
          {/* 바깥 클릭으로 닫기 */}
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute top-full left-1/2 z-20 mt-2 grid w-max -translate-x-1/2 grid-cols-5 gap-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            {EMOTES.map((e) => (
              <button
                key={e.kind}
                type="button"
                title={e.label}
                onClick={() => {
                  onSend(e.kind);
                  setOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-2xl transition-colors hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800"
              >
                {e.emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// 말풍선 — 이름표 옆에 꼬리가 달린 채 톡 떠올랐다 사라지는 1회 연출. key={n}으로 재전송 시 재시작.
// side='left'(내 쪽): 이름표 오른쪽에 붙고 꼬리는 왼쪽(이름)을 가리킴.
// side='right'(상대 쪽): 이름표 왼쪽에 붙고 꼬리는 오른쪽(이름)을 가리킴.
// 부모 요소는 반드시 relative.
export function EmoteBubble({ kind, side }: { kind: EmoteKind; side: 'left' | 'right' }) {
  const wrapPos = side === 'left' ? 'left-full ml-2.5' : 'right-full mr-2.5';
  // 바깥: 이름표와 세로 중앙 정렬(정적 transform). 안쪽 .tk-emote: 떠오름 애니메이션(별도 transform).
  // 두 transform을 분리하지 않으면 애니메이션이 -translate-y-1/2 정렬을 덮어써 위치가 어긋난다.
  return (
    <div className={`pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 ${wrapPos}`}>
      <div className="tk-emote">
        <div className="relative rounded-2xl border border-zinc-300 bg-white px-2.5 py-2 text-2xl leading-none dark:border-zinc-600 dark:bg-zinc-900">
          {emojiFor(kind)}
          {/* 말풍선 꼬리 — 테두리(바깥) + 배경(안쪽) 삼각형 두 겹. */}
          {side === 'left' ? (
            <>
              <span className="absolute -left-[6px] top-1/2 -translate-y-1/2 border-y-[5px] border-r-[6px] border-y-transparent border-r-zinc-300 dark:border-r-zinc-600" />
              <span className="absolute -left-[5px] top-1/2 -translate-y-1/2 border-y-[4px] border-r-[5px] border-y-transparent border-r-white dark:border-r-zinc-900" />
            </>
          ) : (
            <>
              <span className="absolute -right-[6px] top-1/2 -translate-y-1/2 border-y-[5px] border-l-[6px] border-y-transparent border-l-zinc-300 dark:border-l-zinc-600" />
              <span className="absolute -right-[5px] top-1/2 -translate-y-1/2 border-y-[4px] border-l-[5px] border-y-transparent border-l-white dark:border-l-zinc-900" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
