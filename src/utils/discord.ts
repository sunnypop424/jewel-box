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
            // ✨ alert 대신 에러를 throw 하여 UI에서 처리하게 합니다.
            throw new Error(result.error || '디스코드 알림 전송에 실패했습니다.'); 
        }

        console.log('✅ 디스코드 알림 전송 성공!', result);
    } catch (error) {
        console.error('❌ 통신 자체 실패 (네트워크/CORS 오류 등):', error);
        // 네트워크 연결 자체 실패의 경우
        if (error instanceof Error) {
            throw error;
        } else {
            throw new Error('서버와 통신할 수 없습니다.');
        }
    }
};