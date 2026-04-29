// 미션 정산 전용 디스코드 채널과 통신하는 wrapper.
// Cloudflare Workers 의 /api/discord-mission 엔드포인트가 실제 Discord API 호출을 담당합니다.
//
// 디자인: SETTLED 상태에서 알림이 게시되고, COMPLETED(또는 무효/실패) 시점에 그 메시지를 삭제하여
// 채널을 깔끔하게 유지합니다. (scheduleNotifier 와 동일한 패턴)

import type { MissionType } from '../types';

const WORKER_MISSION_URL = 'https://discord-bot.sunnypop424.workers.dev/api/discord-mission';

export interface MissionSettledPayload {
  missionId: string;
  issuer: string;
  winner: string;
  goldAmount: number;
  title: string;
  type: MissionType;
}

// 정산 대기 메시지를 채널에 게시하고 messageId 를 반환합니다.
// 실패해도 사용자 흐름을 막지 않도록 null 을 반환합니다 (워커가 채널 미설정 시에도 동일 동작).
export async function postMissionSettledMessage(payload: MissionSettledPayload): Promise<string | null> {
  try {
    const res = await fetch(WORKER_MISSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...payload }),
    });
    if (!res.ok) {
      console.warn('[missionNotifier] 정산 메시지 게시 실패:', res.status);
      return null;
    }
    const data = await res.json();
    return typeof data?.messageId === 'string' ? data.messageId : null;
  } catch (err) {
    console.warn('[missionNotifier] 정산 메시지 게시 중 예외:', err);
    return null;
  }
}

// 이전에 게시된 메시지를 채널에서 삭제합니다.
export async function deleteMissionMessage(messageId: string | undefined | null): Promise<void> {
  if (!messageId) return;
  try {
    const res = await fetch(WORKER_MISSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', messageId }),
    });
    if (!res.ok) {
      console.warn('[missionNotifier] 정산 메시지 삭제 실패:', res.status);
    }
  } catch (err) {
    console.warn('[missionNotifier] 정산 메시지 삭제 중 예외:', err);
  }
}

// 웹에서 송금/수령을 토글했을 때 디스코드 메시지의 ☐/☑ 마크와 버튼 색을 동기화합니다.
// 워커가 missionId 로 Firestore 를 다시 읽고 메시지를 PATCH 합니다.
export async function refreshMissionMessage(missionId: string): Promise<void> {
  if (!missionId) return;
  try {
    const res = await fetch(WORKER_MISSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', missionId }),
    });
    if (!res.ok) {
      console.warn('[missionNotifier] 정산 메시지 동기화 실패:', res.status);
    }
  } catch (err) {
    console.warn('[missionNotifier] 정산 메시지 동기화 중 예외:', err);
  }
}
