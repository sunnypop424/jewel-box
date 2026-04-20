// Discord 글로벌 슬래시 커맨드 '개별' 등록/갱신 스크립트
// POST 방식: 이 파일에 정의된 커맨드만 추가/갱신하고, 기존에 이미 등록된 다른 커맨드는 그대로 둡니다.
// (같은 이름의 커맨드가 이미 있으면 그 커맨드의 정의만 덮어씁니다. Discord 공식 동작입니다.)
//
// 사용법:
//   1) DISCORD_APP_ID, DISCORD_BOT_TOKEN 환경변수 설정
//        (Windows PowerShell)  $env:DISCORD_APP_ID="..."; $env:DISCORD_BOT_TOKEN="..."
//        (Git Bash / macOS)    export DISCORD_APP_ID=...; export DISCORD_BOT_TOKEN=...
//   2) node scripts/registerDiscordCommands.mjs
//
// 참고: 글로벌 커맨드이므로 반영까지 최대 1시간 걸릴 수 있습니다.

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('DISCORD_APP_ID / DISCORD_BOT_TOKEN 환경변수를 먼저 설정해 주세요.');
  process.exit(1);
}

// Discord Option Types
// 1 = SUB_COMMAND, 2 = SUB_COMMAND_GROUP, 3 = STRING, 4 = INTEGER, 5 = BOOLEAN, 6 = USER ...
const commands = [
  {
    name: '일정',
    description: '공대원 개인 일정(참여 불가일)을 관리합니다.',
    options: [
      {
        type: 1, // SUB_COMMAND
        name: '등록',
        description: '참여 불가 일정을 등록합니다. 단일 날짜는 시작일/종료일에 같은 값을 입력하세요.',
        options: [
          {
            type: 3,
            name: '시작일',
            description: 'MMDD 4자리 숫자 (예: 0420 → 올해 4월 20일)',
            required: true,
          },
          {
            type: 3,
            name: '종료일',
            description: 'MMDD 4자리 숫자 (단일 날짜면 시작일과 동일하게)',
            required: true,
          },
          {
            type: 3,
            name: '사유',
            description: '사유를 입력하세요.',
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: '조회',
        description: '본인 또는 지정한 공대원의 등록된 일정을 조회합니다.',
        options: [
          {
            type: 3,
            name: '유저명',
            description: '생략하면 본인 일정을 조회합니다.',
            required: false,
            autocomplete: true, // Worker 의 autocomplete 핸들러(유저명)와 연동
          },
        ],
      },
      {
        type: 1,
        name: '삭제',
        description: '본인의 특정 날짜 일정을 삭제합니다.',
        options: [
          {
            type: 3,
            name: '날짜',
            description: 'MMDD 4자리 숫자 (예: 0420 → 올해 4월 20일)',
            required: true,
          },
        ],
      },
    ],
  },
];

const endpoint = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

async function registerOne(cmd) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[실패] /${cmd.name} — ${res.status}`, text);
    return false;
  }

  try {
    const parsed = JSON.parse(text);
    console.log(`[성공] /${parsed.name} (id: ${parsed.id})`);
  } catch {
    console.log(`[성공] /${cmd.name}`);
  }
  return true;
}

async function main() {
  let okCount = 0;
  for (const cmd of commands) {
    if (await registerOne(cmd)) okCount++;
  }
  console.log(`\n총 ${okCount}/${commands.length} 개 커맨드가 등록/갱신되었습니다.`);
  console.log('반영까지 최대 1시간 걸릴 수 있습니다.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
