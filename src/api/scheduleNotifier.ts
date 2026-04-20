// 일정 공유 전용 디스코드 채널과 통신하는 wrapper.
// Cloudflare Workers 의 /api/discord-schedule 엔드포인트가 실제 Discord API 호출을 담당합니다.
//
// 디자인: "등록 알림이 그대로 남아 있고, 삭제 시 그 메시지를 삭제한다" 구조.
// 따라서 create 는 messageId 를 반환하고, delete 는 기존 messageId 를 받아 해당 메시지를 지웁니다.
// (update 개념은 존재하지 않음: 사유만 수정 시 Discord 쪽은 건드리지 않습니다.)

const WORKER_SCHEDULE_URL = 'https://discord-bot.sunnypop424.workers.dev/api/discord-schedule';

export interface ScheduleCreatePayload {
  discordName: string;
  date: string;   // 단일 날짜 'YYYY-MM-DD' 또는 기간 'YYYY-MM-DD ~ YYYY-MM-DD (N일)'
  reason: string;
}

// 등록 메시지를 채널에 게시하고, 게시된 메시지의 ID 를 반환합니다.
// 실패해도 사용자 흐름을 막지 않도록 null 을 반환합니다.
export async function postScheduleCreateMessage(payload: ScheduleCreatePayload): Promise<string | null> {
  try {
    const res = await fetch(WORKER_SCHEDULE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...payload }),
    });
    if (!res.ok) {
      console.warn('[scheduleNotifier] 등록 메시지 게시 실패:', res.status);
      return null;
    }
    const data = await res.json();
    return typeof data?.messageId === 'string' ? data.messageId : null;
  } catch (err) {
    console.warn('[scheduleNotifier] 등록 메시지 게시 중 예외:', err);
    return null;
  }
}

// 이전에 게시된 메시지를 채널에서 삭제합니다.
// messageId 가 없으면 아무것도 하지 않습니다 (이전 방식으로 등록된 구 데이터 호환용).
export async function deleteScheduleMessage(messageId: string | undefined | null): Promise<void> {
  if (!messageId) return;
  try {
    const res = await fetch(WORKER_SCHEDULE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', messageId }),
    });
    if (!res.ok) {
      console.warn('[scheduleNotifier] 등록 메시지 삭제 실패:', res.status);
    }
  } catch (err) {
    console.warn('[scheduleNotifier] 등록 메시지 삭제 중 예외:', err);
  }
}
