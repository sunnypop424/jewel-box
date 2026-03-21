// src/utils/discord.ts
export const sendDiscordNotification = async (message: string) => {
  const WORKER_URL = "https://discord-bot.sunnypop424.workers.dev";
  
  try {
    const response = await fetch(`${WORKER_URL}/api/discord-minigame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('❌ 워커에서 에러 반환됨:', result.error || result);
      alert(`디스코드 전송 실패: ${result.error}`); // 화면에 에러를 띄웁니다!
      return;
    }

    console.log('✅ 디스코드 알림 전송 성공!', result);
  } catch (error) {
    console.error('❌ 통신 자체 실패 (네트워크/CORS 오류 등):', error);
  }
};