//https://discord-bot.sunnypop424.workers.dev/
const InteractionType = { 
  PING: 1, 
  APPLICATION_COMMAND: 2, 
  MESSAGE_COMPONENT: 3, 
  APPLICATION_COMMAND_AUTOCOMPLETE: 4 
};
const InteractionResponseType = { 
  PONG: 1, 
  CHANNEL_MESSAGE_WITH_SOURCE: 4, 
  UPDATE_MESSAGE: 7, 
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8 
};

// === GEN:RAID-LEDGER-BEGIN ===
// 자동 생성: npm run gen:worker-raids
// 원본: src/data/raids.ts — 직접 수정하지 말 것.

const RAID_META = {
  "HORIZON_STEP1": {
    "label": "지평의 성당 1단계",
    "generalGold": 0,
    "boundGold": 30000
  },
  "HORIZON_STEP2": {
    "label": "지평의 성당 2단계",
    "generalGold": 0,
    "boundGold": 40000
  },
  "HORIZON_STEP3": {
    "label": "지평의 성당 3단계",
    "generalGold": 0,
    "boundGold": 50000
  },
  "KAZEROS_NORMAL": {
    "label": "카제로스 익스트림 노말",
    "generalGold": 20000,
    "boundGold": 0
  },
  "KAZEROS_HARD": {
    "label": "카제로스 익스트림 하드",
    "generalGold": 45000,
    "boundGold": 0
  },
  "KAZEROS_NIGHTMARE": {
    "label": "카제로스 익스트림 나이트메어",
    "generalGold": 45000,
    "boundGold": 0
  },
  "SERKA_NORMAL": {
    "label": "세르카 노말",
    "generalGold": 17500,
    "boundGold": 17500
  },
  "SERKA_HARD": {
    "label": "세르카 하드",
    "generalGold": 44000,
    "boundGold": 0
  },
  "SERKA_NIGHTMARE": {
    "label": "세르카 나이트메어",
    "generalGold": 54000,
    "boundGold": 0
  },
  "FINAL_NORMAL": {
    "label": "종막 노말",
    "generalGold": 20000,
    "boundGold": 20000
  },
  "FINAL_HARD": {
    "label": "종막 하드",
    "generalGold": 52000,
    "boundGold": 0
  },
  "ACT4_NORMAL": {
    "label": "4막 노말",
    "generalGold": 16500,
    "boundGold": 16500
  },
  "ACT4_HARD": {
    "label": "4막 하드",
    "generalGold": 42000,
    "boundGold": 0
  },
  "ACT3_NORMAL": {
    "label": "3막 노말",
    "generalGold": 10500,
    "boundGold": 10500
  },
  "ACT3_HARD": {
    "label": "3막 하드",
    "generalGold": 13500,
    "boundGold": 13500
  },
  "ACT2_NORMAL": {
    "label": "2막 노말",
    "generalGold": 8250,
    "boundGold": 8250
  },
  "ACT2_HARD": {
    "label": "2막 하드",
    "generalGold": 11500,
    "boundGold": 11500
  },
  "ACT1_HARD": {
    "label": "1막 하드",
    "generalGold": 9000,
    "boundGold": 9000
  }
};

const RAIDS = [
  {
    "family": "HORIZON",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "STEP1",
        "minItemLevel": 1700,
        "requiresFlag": null
      },
      {
        "tier": "STEP2",
        "minItemLevel": 1720,
        "requiresFlag": null
      },
      {
        "tier": "STEP3",
        "minItemLevel": 1750,
        "requiresFlag": null
      }
    ]
  },
  {
    "family": "KAZEROS",
    "clearScope": "roster",
    "availableFrom": "2026-04-22",
    "availableUntil": "2026-06-16",
    "difficulties": [
      {
        "tier": "NORMAL",
        "minItemLevel": 1720,
        "requiresFlag": null
      },
      {
        "tier": "HARD",
        "minItemLevel": 1750,
        "requiresFlag": null
      },
      {
        "tier": "NIGHTMARE",
        "minItemLevel": 1770,
        "requiresFlag": null
      }
    ]
  },
  {
    "family": "SERKA",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "NORMAL",
        "minItemLevel": 1710,
        "requiresFlag": null
      },
      {
        "tier": "HARD",
        "minItemLevel": 1730,
        "requiresFlag": null
      },
      {
        "tier": "NIGHTMARE",
        "minItemLevel": 1740,
        "requiresFlag": "serkaNightmare"
      }
    ]
  },
  {
    "family": "FINAL",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "NORMAL",
        "minItemLevel": 1710,
        "requiresFlag": null
      },
      {
        "tier": "HARD",
        "minItemLevel": 1730,
        "requiresFlag": null
      }
    ]
  },
  {
    "family": "ACT4",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "NORMAL",
        "minItemLevel": 1700,
        "requiresFlag": null
      },
      {
        "tier": "HARD",
        "minItemLevel": 1720,
        "requiresFlag": null
      }
    ]
  },
  {
    "family": "ACT3",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "NORMAL",
        "minItemLevel": 1680,
        "requiresFlag": null
      },
      {
        "tier": "HARD",
        "minItemLevel": 1700,
        "requiresFlag": null
      }
    ]
  },
  {
    "family": "ACT2",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "NORMAL",
        "minItemLevel": 1670,
        "requiresFlag": null
      },
      {
        "tier": "HARD",
        "minItemLevel": 1690,
        "requiresFlag": null
      }
    ]
  },
  {
    "family": "ACT1",
    "clearScope": "character",
    "availableFrom": null,
    "availableUntil": null,
    "difficulties": [
      {
        "tier": "HARD",
        "minItemLevel": 1680,
        "requiresFlag": null
      }
    ]
  }
];

function isWithinAvailability(raid, now) {
  const t = now.getTime();
  const parseKst = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000;
  };
  if (raid.availableFrom && t < parseKst(raid.availableFrom)) return false;
  if (raid.availableUntil) {
    const untilMs = parseKst(raid.availableUntil) + 24 * 60 * 60 * 1000;
    if (t >= untilMs) return false;
  }
  return true;
}

// 캐릭 스코프 레이드 후보 (원정대 스코프는 getRosterRaidsForChar 로 별도 처리).
function getTargetRaidsForCharacter(ch) {
  const il = ch.itemLevel;
  const now = new Date();
  const horizon = [];
  const normal = [];
  for (const raid of RAIDS) {
    if (!isWithinAvailability(raid, now)) continue;
    if (raid.clearScope === 'roster') continue;

    const singleId = (ch.singleRaids || []).find(
      r => getRaidFamily(r) === raid.family && r.endsWith('_SINGLE')
    );
    if (singleId) {
      const singleDiff = raid.difficulties.find(d => d.tier === 'SINGLE');
      if (singleDiff && il >= singleDiff.minItemLevel) {
        if (raid.family === 'HORIZON') horizon.push(singleId);
        else normal.push(singleId);
      }
      continue;
    }

    const qualified = raid.difficulties.filter((d) => {
      if (d.tier === 'SINGLE') return false;
      if (il < d.minItemLevel) return false;
      if (d.requiresFlag && !ch[d.requiresFlag]) return false;
      return true;
    });
    if (qualified.length === 0) continue;
    const chosen = qualified.reduce((hi, d) => d.minItemLevel > hi.minItemLevel ? d : hi);
    const raidId = raid.family + '_' + chosen.tier;
    if (raid.family === 'HORIZON') horizon.push(raidId);
    else normal.push(raidId);
  }
  return [...horizon, ...normal.slice(0, 3)];
}

// 이 캐릭이 대표로 지정된 원정대 스코프 레이드 목록.
function getRosterRaidsForChar(ch, rosterRaidState) {
  if (!rosterRaidState) return [];
  const rosterId = ch.rosterId || ch.discordName;
  if (!rosterId) return [];
  const selections = rosterRaidState[rosterId] || {};
  const now = new Date();
  const out = [];
  for (const family in selections) {
    const sel = selections[family];
    if (!sel || sel.selectedCharId !== ch.id) continue;
    const raid = RAIDS.find(r => r.family === family);
    if (!raid || raid.clearScope !== 'roster') continue;
    if (!isWithinAvailability(raid, now)) continue;
    const diff = raid.difficulties.find(d => d.tier === sel.difficulty);
    if (!diff) continue;
    if (ch.itemLevel < diff.minItemLevel) continue;
    if (diff.requiresFlag && !ch[diff.requiresFlag]) continue;
    out.push(raid.family + '_' + diff.tier);
  }
  return out;
}

function getRaidFamily(raidId) {
  return raidId.slice(0, raidId.indexOf('_'));
}


// 귀속 골드 무시 여부. 웹앱 App.tsx computeIgnoreBoundGold 와 동일.
function computeIgnoreBound(ch, userChars) {
  if (ch.receiveBoundGold !== undefined) return !ch.receiveBoundGold;
  const option = ch.goldOption || 'ALL_MAX';
  if (option === 'GENERAL_MAX') return true;
  if (option === 'MAIN_ALL_ALT_GENERAL') {
    const mainChar = userChars.reduce((max, curr) => curr.itemLevel > max.itemLevel ? curr : max, userChars[0]);
    return ch.id !== mainChar.id;
  }
  return false;
}

// 캐릭 1명 관점에서 원장 기반 주간 top3 계산.
// 웹앱 src/data/raids.ts getCharTopRaidIds 와 같은 공식이어야 한다.
// 원정대 레이드는 3회 골드 제한에 포함되지 않으므로 캐릭 스코프와 분리.
// 반환: { ignoreBound, ledgerEntries, clearedFamilies, activeYields, activeIds,
//        cGen, cBnd, tGen, tBnd, raidsForChar, raidYieldById }
function computeCharLedgerView(ch, clears, userChars, rosterRaidState) {
  const ignoreBound = computeIgnoreBound(ch, userChars);
  const ledgerEntries = Object.values((clears && clears[ch.id]) || {}).filter(Boolean);
  const clearedFamilies = new Set(ledgerEntries.map(e => getRaidFamily(e.raidId)));

  // 캐릭 스코프 / 원정대 스코프 분리.
  const charCandByFamily = new Map();
  const rosterCandByFamily = new Map();

  for (const e of ledgerEntries) {
    const fam = getRaidFamily(e.raidId);
    const isRoster = RAIDS.find(r => r.family === fam)?.clearScope === 'roster';
    const target = isRoster ? rosterCandByFamily : charCandByFamily;
    target.set(fam, { id: e.raidId, general: e.generalGold, bound: e.boundGold, isCleared: true });
  }

  const il = ch.itemLevel;
  const now = new Date();
  for (const raid of RAIDS) {
    if (!isWithinAvailability(raid, now)) continue;
    if (raid.clearScope === 'roster') continue;

    const singleId = (ch.singleRaids || []).find(
      r => getRaidFamily(r) === raid.family && r.endsWith('_SINGLE')
    );
    if (singleId) {
      const singleDiff = raid.difficulties.find(d => d.tier === 'SINGLE');
      if (singleDiff && il >= singleDiff.minItemLevel) {
        const fam = getRaidFamily(singleId);
        if (!charCandByFamily.has(fam)) {
          const meta = RAID_META[singleId];
          charCandByFamily.set(fam, { id: singleId, general: meta.generalGold, bound: meta.boundGold, isCleared: false });
        }
      }
      continue;
    }

    const q = raid.difficulties.filter(d => {
      if (d.tier === 'SINGLE') return false;
      if (il < d.minItemLevel) return false;
      if (d.requiresFlag && !ch[d.requiresFlag]) return false;
      return true;
    });
    if (q.length === 0) continue;
    const chosen = q.reduce((hi, d) => d.minItemLevel > hi.minItemLevel ? d : hi);
    const id = raid.family + '_' + chosen.tier;
    const fam = getRaidFamily(id);
    if (!charCandByFamily.has(fam)) {
      const meta = RAID_META[id];
      charCandByFamily.set(fam, { id, general: meta.generalGold, bound: meta.boundGold, isCleared: false });
    }
  }
  const rosterEligible = getRosterRaidsForChar(ch, rosterRaidState);
  for (const id of rosterEligible) {
    const fam = getRaidFamily(id);
    if (!rosterCandByFamily.has(fam)) {
      const meta = RAID_META[id];
      rosterCandByFamily.set(fam, { id, general: meta.generalGold, bound: meta.boundGold, isCleared: false });
    }
  }

  const eff = (c) => { const isSplit = c.general > 0 && c.bound > 0; return c.general + (isSplit || !ignoreBound ? c.bound : 0); };

  const charTop3 = Array.from(charCandByFamily.values())
    .map(y => Object.assign({}, y, { effective: eff(y) }))
    .filter(y => y.effective > 0)
    .sort((a, b) => b.effective - a.effective)
    .slice(0, 3);

  const rosterYields = Array.from(rosterCandByFamily.values())
    .map(y => Object.assign({}, y, { effective: eff(y) }))
    .filter(y => y.effective > 0);

  const activeYields = [...charTop3, ...rosterYields];
  const activeIds = new Set(activeYields.map(y => y.id));

  let cGen = 0, cBnd = 0, tGen = 0, tBnd = 0;
  for (const y of activeYields) {
    tGen += y.general;
    if (!ignoreBound) tBnd += y.bound;
    if (y.isCleared) {
      cGen += y.general;
      if (!ignoreBound) cBnd += y.bound;
    }
  }

  const raidsForChar = activeYields.map(y => y.id);
  const raidYieldById = {};
  for (const y of activeYields) raidYieldById[y.id] = y;

  return { ignoreBound, ledgerEntries, clearedFamilies, activeYields, activeIds, cGen, cBnd, tGen, tBnd, raidsForChar, raidYieldById };
}

// === GEN:RAID-LEDGER-END ===

// =============================================================================
// Ledger Firestore 쓰기 헬퍼 (raidData/clears 문서)
// =============================================================================

function toFirestoreClearEntry(entry) {
  return {
    mapValue: {
      fields: {
        raidId: { stringValue: entry.raidId },
        clearedAt: { stringValue: entry.clearedAt },
        clearedItemLevel: { integerValue: entry.clearedItemLevel },
        generalGold: { integerValue: entry.generalGold },
        boundGold: { integerValue: entry.boundGold },
      }
    }
  };
}

// 특정 캐릭의 특정 레이드 엔트리 upsert. 먼저 기존 캐릭 맵 읽어오고 병합.
async function writeClearEntryREST(env, clears, charId, entry) {
  const charMap = { ...(clears[charId] || {}) };
  charMap[entry.raidId] = entry;
  const fields = {};
  for (const [raidId, e] of Object.entries(charMap)) {
    fields[raidId] = toFirestoreClearEntry(e);
  }
  const updateUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/clears?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=${encodeURIComponent(charId)}`;
  const payload = { fields: { [charId]: { mapValue: { fields } } } };
  return fetch(updateUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

// 특정 캐릭의 특정 레이드 엔트리 삭제. 나머지 엔트리만 남겨서 PATCH.
async function deleteClearEntryREST(env, clears, charId, raidId) {
  const charMap = { ...(clears[charId] || {}) };
  delete charMap[raidId];
  const fields = {};
  for (const [rId, e] of Object.entries(charMap)) {
    fields[rId] = toFirestoreClearEntry(e);
  }
  const updateUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/clears?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=${encodeURIComponent(charId)}`;
  const payload = { fields: { [charId]: { mapValue: { fields } } } };
  return fetch(updateUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}

function buildClearEntry(ch, raidId) {
  const meta = RAID_META[raidId];
  return {
    raidId,
    clearedAt: new Date().toISOString(),
    clearedItemLevel: ch.itemLevel,
    generalGold: meta.generalGold,
    boundGold: meta.boundGold,
  };
}

function parseFirestoreValue(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(parseFirestoreValue);
  if (v.mapValue !== undefined) return parseFirestoreDoc(v.mapValue);
  if (v.nullValue !== undefined) return null;
  return v;
}

function parseFirestoreDoc(doc) {
  if (!doc || !doc.fields) return {};
  const res = {};
  for (const [key, val] of Object.entries(doc.fields)) res[key] = parseFirestoreValue(val);
  return res;
}

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/.{1,2}/g).map(v => parseInt(v, 16)));
}

async function verifyDiscordRequest(request, publicKey) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.clone().text();
  if (!signature || !timestamp || !publicKey) return false;
  try {
    const key = await crypto.subtle.importKey('raw', hexToUint8Array(publicKey), { name: 'Ed25519', namedCurve: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, hexToUint8Array(signature), new TextEncoder().encode(timestamp + body));
  } catch (e) { return false; }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ===========================================================
// 🌟 공대원 개인 일정(참여 불가일) 관련 공용 헬퍼
// ===========================================================
// 디스코드 커맨드용 날짜 정규화 — 오직 "MMDD" 4자리 숫자만 허용.
//   - 예) "0420" → 올해의 04월 20일 (KST 기준)
//   - 단, 입력한 MMDD 가 KST 오늘 MMDD 보다 과거면 "내년" 의 같은 날짜로 해석
//        예) 오늘 4/20 이고 "0310" 입력 → 내년 3/10
//   - 하이픈/슬래시/'오늘'/'내일' 등 그 외 모든 포맷은 거부(null)
// 내부 저장 포맷은 기존과 호환되도록 "YYYY-MM-DD" 를 그대로 반환합니다.
function normalizeScheduleDate(input) {
  if (!input) return null;
  const trimmed = String(input).trim();

  // 4자리 숫자 외에는 전부 거절
  if (!/^\d{4}$/.test(trimmed)) return null;

  const mm = parseInt(trimmed.slice(0, 2), 10);
  const dd = parseInt(trimmed.slice(2), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  // KST 오늘 기준
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayY = nowKst.getUTCFullYear();
  const todayMmdd = (nowKst.getUTCMonth() + 1) * 100 + nowKst.getUTCDate();
  const inputMmdd = mm * 100 + dd;

  // 오늘보다 과거 MMDD 이면 내년으로 해석
  const y = inputMmdd < todayMmdd ? todayY + 1 : todayY;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// 디스코드 일정 공유 채널로 알림 메시지 전송 (웹/디스코드 양쪽에서 공용으로 호출)
// YYYY-MM-DD → "YYYY-MM-DD (요일)" 형태로 포맷 (요일은 한글 한 글자)
function formatDateWithDow(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') return dateKey || '';
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateKey;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()];
  return `${dateKey} (${dow})`;
}

// 일정 공유 채널에 등록 메시지를 게시하고, 게시된 메시지의 ID 를 반환합니다.
// (삭제 시 이 ID 로 메시지를 함께 지우는 방식이라 별도 "삭제 알림"은 쏘지 않습니다.)
async function postScheduleCreateMessage(env, { discordName, date, reason }) {
  const botToken = env.DISCORD_BOT_TOKEN;
  const channelId = env.DISCORD_SCHEDULE_CHANNEL_ID || env.DISCORD_CHANNEL_ID;
  if (!botToken || !channelId) return { ok: false, reason: 'CHANNEL_NOT_SET', messageId: null };

  const content =
    `##[${discordName}]님의 레이드 참여 불가 일정 등록\n` +
    `- 날짜: **${date}**\n` +
    `- 사유: ${reason || '(미입력)'}`;

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) return { ok: false, reason: `HTTP_${res.status}`, messageId: null };
    const data = await res.json();
    return { ok: true, messageId: data?.id || null };
  } catch (e) {
    return { ok: false, reason: e.message, messageId: null };
  }
}

// 이전에 게시한 등록 메시지를 삭제합니다. messageId 가 없으면 아무 것도 하지 않음.
// 이미 삭제된 메시지(404)는 정상(성공)으로 간주.
async function deleteScheduleMessageById(env, messageId) {
  if (!messageId) return { ok: true, skipped: true };
  const botToken = env.DISCORD_BOT_TOKEN;
  const channelId = env.DISCORD_SCHEDULE_CHANNEL_ID || env.DISCORD_CHANNEL_ID;
  if (!botToken || !channelId) return { ok: false, reason: 'CHANNEL_NOT_SET' };

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bot ${botToken}` }
    });
    if (res.status === 404) return { ok: true, alreadyGone: true };
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// Firestore REST API: personalSchedules 컬렉션 전체 조회
async function fetchPersonalSchedules(env) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/personalSchedules?key=${env.FIREBASE_API_KEY}&pageSize=1000`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents || []).map(doc => {
    const id = doc.name.split('/').pop();
    return { id, ...parseFirestoreDoc(doc) };
  });
}

// Firestore REST API: personalSchedules 에 새 문서 생성
async function createPersonalSchedule(env, payload) {
  const now = new Date().toISOString();
  const fields = {
    discordName: { stringValue: payload.discordName },
    discordId: { stringValue: payload.discordId || '' },
    date: { stringValue: payload.date },
    reason: { stringValue: payload.reason || '' },
    source: { stringValue: payload.source || 'discord' },
    createdAt: { stringValue: now },
    updatedAt: { stringValue: now },
  };
  if (payload.discordMessageId) {
    fields.discordMessageId = { stringValue: payload.discordMessageId };
  }
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/personalSchedules?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.ok;
}

// Firestore REST API: personalSchedules 에서 문서 삭제
async function deletePersonalSchedule(env, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/personalSchedules/${id}?key=${env.FIREBASE_API_KEY}`;
  const res = await fetch(url, { method: 'DELETE' });
  return res.ok;
}

// 🌟 메모리 캐싱 변수
let firebaseCache = {
  data: null,
  lastFetchTime: 0
};
const CACHE_TTL_MS = 60 * 1000; 

// 🌟 캐시를 활용한 Firebase 데이터 로드 함수
// exclusions 컬렉션은 제거 — clears (ledger) 가 대체.
async function fetchFirebaseWithCache(env) {
  const now = Date.now();
  if (firebaseCache.data && (now - firebaseCache.lastFetchTime < CACHE_TTL_MS)) {
    return firebaseCache.data;
  }

  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const [usersRes, clearsRes, goldRes, rosterRaidRes] = await Promise.all([
    fetch(`${url}/users?key=${env.FIREBASE_API_KEY}`),
    fetch(`${url}/${env.FIRESTORE_COLLECTION}/clears?key=${env.FIREBASE_API_KEY}`),
    fetch(`${url}/${env.FIRESTORE_COLLECTION}/accumulatedGold?key=${env.FIREBASE_API_KEY}`),
    fetch(`${url}/${env.FIRESTORE_COLLECTION}/rosterRaidState?key=${env.FIREBASE_API_KEY}`)
  ]);

  const usersData = await usersRes.json();
  const clearsData = await clearsRes.json();
  const goldData = await goldRes.json();
  const rosterRaidData = await rosterRaidRes.json();

  let allChars = [];
  (usersData.documents || []).forEach(doc => {
    const parsed = parseFirestoreDoc(doc);
    const docId = doc.name ? doc.name.split('/').pop() : null;

    if (parsed.characters) {
      const isUserParticipating = parsed.isParticipating !== false;
      parsed.characters.forEach(c => {
        c._isUserParticipating = isUserParticipating;
        c.discordId = c.discordId || parsed.discordId || docId;
        c.discordName = c.discordName || parsed.discordName;
        // rosterId 기본값 주입 (웹앱과 동일 규칙).
        if (!c.rosterId) c.rosterId = c.discordName;
        allChars.push(c);
      });
    }
  });

  // clears 파싱: 문서가 없으면 빈 객체. { [charId]: { [raidId]: ClearEntry } }
  const clears = clearsData && clearsData.fields ? parseFirestoreDoc(clearsData) : {};
  const accumulatedGold = parseFirestoreDoc(goldData);
  // 원정대 스코프 레이드 상태: { [rosterId]: { [raidFamily]: { selectedCharId, difficulty } } }
  const rosterRaidState = rosterRaidData && rosterRaidData.fields ? parseFirestoreDoc(rosterRaidData) : {};

  firebaseCache.data = { allChars, clears, accumulatedGold, rosterRaidState };
  firebaseCache.lastFetchTime = now;

  return firebaseCache.data;
}

// 🌟 명령어를 실행한 유저 본인인지 식별하는 공통 함수
function resolveTargetUserChars(allChars, targetInputName, userId, discordUserName) {
  let chars = [];
  let resolvedUserName = targetInputName;

  if (targetInputName) {
    // 1. 유저명 옵션을 직접 입력한 경우
    chars = allChars.filter(c => c.discordName === targetInputName);
  } else {
    // 2. 생략한 경우: 본인의 discordId로 우선 검색 -> 닉네임 후순위 검색
    chars = allChars.filter(c => c.discordId === userId);
    if (chars.length === 0) {
      chars = allChars.filter(c => c.discordName === discordUserName);
    }
    // 본인 것으로 찾았다면 표시될 유저명 갱신
    if (chars.length > 0) {
      resolvedUserName = chars[0].discordName || discordUserName;
    }
  }
  
  // 아이템 레벨 순 정렬
  chars.sort((a,b) => b.itemLevel - a.itemLevel);
  return { chars, resolvedUserName };
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 🌟 [웹 앱 -> 디스코드 파티 모집 알림 발송 API]
    if (url.pathname === '/api/discord-gathering' && request.method === 'POST') {
      try {
        const body = await request.json();
        const botToken = env.DISCORD_BOT_TOKEN; 
        const channelId = env.DISCORD_CHANNEL_ID;
        
        if (!botToken || !channelId) {
          return new Response(JSON.stringify({ error: '봇 토큰 또는 채널 ID가 설정되지 않았습니다.' }), { status: 500, headers: corsHeaders });
        }

        const raidPrefix = body.raid === '모여서 정합니다' ? '아무거나' : body.raid;
        const memoText = body.memo ? `**[메모]**\n${body.memo}` : `**[메모]**\n없습니다.`;

        const textContent = `@everyone\n# [${raidPrefix}] 파티 모집\n\n## 일시: ${body.date} / ${body.time}\n## 레이드: ${body.raid}\n\n**[경고] 지각 시 제외하고 바로 출발합니다.**\n불참/지각이 예상되면 미리 말씀해 주세요.\n바로 출발할 수 있도록 미리 접속해 주세요.\n\n${memoText}\n\n==============================\n\n**참여자 목록 (0명)**\n(아직 없음)\n`;

        const payload = {
          content: textContent,
          embeds: [],
          components: [{
            type: 1, 
            components: [
              { type: 2, style: 3, label: "참여하기", custom_id: "gather_join" },
              { type: 2, style: 4, label: "불참/취소", custom_id: "gather_leave" }
            ]
          }]
        };

        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!discordRes.ok) throw new Error('디스코드 API 전송에 실패했습니다.');
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 🌟 [웹 앱 -> 디스코드 일정 공유 채널 API]
    // 지원 action:
    //   - 'create': { discordName, date, reason } → 메시지 게시 후 { success, messageId } 반환
    //   - 'delete': { messageId }                → 해당 메시지 삭제
    // 별도의 수정(update) 액션은 없습니다. 사유 수정은 Firestore 만 조용히 변경.
    if (url.pathname === '/api/discord-schedule' && request.method === 'POST') {
      try {
        const body = await request.json();
        const action = body.action || 'create';

        if (action === 'delete') {
          if (!body.messageId) {
            return new Response(JSON.stringify({ error: 'messageId 누락' }), { status: 400, headers: corsHeaders });
          }
          const result = await deleteScheduleMessageById(env, body.messageId);
          if (!result.ok) throw new Error(result.reason || 'DISCORD_FAIL');
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // action === 'create'
        if (!body.discordName || !body.date) {
          return new Response(JSON.stringify({ error: '필수 파라미터 누락' }), { status: 400, headers: corsHeaders });
        }
        const result = await postScheduleCreateMessage(env, {
          discordName: body.discordName,
          date: body.date,
          reason: body.reason || '',
        });
        if (!result.ok) throw new Error(result.reason || 'DISCORD_FAIL');
        return new Response(JSON.stringify({ success: true, messageId: result.messageId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // 🌟 [웹 앱 -> 디스코드 미니게임 결과 발송 API]
    if (url.pathname === '/api/discord-minigame' && request.method === 'POST') {
      try {
        const body = await request.json();
        const botToken = env.DISCORD_BOT_TOKEN; 
        const channelId = env.DISCORD_MINIGAME_CHANNEL_ID; 
        
        if (!botToken || !channelId) {
          return new Response(JSON.stringify({ error: '봇 토큰 또는 미니게임 채널 ID가 설정되지 않았습니다.' }), { status: 500, headers: corsHeaders });
        }

        const payload = { content: body.message };

        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!discordRes.ok) throw new Error('디스코드 API 전송에 실패했습니다.');
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==========================================
    // 기존 디스코드 Interaction(웹훅) 검증
    // ==========================================
    if (request.method !== 'POST') return new Response('Not Allowed', { status: 405 });
    if (!(await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY))) return new Response('Bad signature', { status: 401 });

    const interaction = await request.json();
    if (interaction.type === InteractionType.PING) return new Response(JSON.stringify({ type: InteractionResponseType.PONG }));

    // ==========================================
    // 🌟 버튼 및 드롭다운 클릭 (MESSAGE_COMPONENT) 처리
    // ==========================================
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      try {
        const customId = interaction.data.custom_id;
        
        // 1. 파티 모집글 버튼 처리
        if (customId === 'gather_join' || customId === 'gather_leave') {
          const member = interaction.member;
          const user = member ? member.user : interaction.user;
          const discordUserName = (member && member.nick) ? member.nick : (user.global_name || user.username);
          
          const content = interaction.message.content || "";
          const delimiter = "==============================";
          const parts = content.split(delimiter);
          
          if (parts.length < 2) {
            return new Response(JSON.stringify({
              type: 4, 
              data: { content: "[안내] 참여자 목록 영역을 찾을 수 없습니다.", flags: 64 } 
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          const baseContent = parts[0].trim();
          const listSection = parts[1].trim(); 
          const lines = listSection.split('\n');
          const listLine = lines.slice(1).join('\n').trim();

          let currentList = listLine === '(아직 없음)' ? [] : listLine.split(', ').map(s => s.trim());

          if (customId === 'gather_join') {
            if (!currentList.includes(discordUserName)) currentList.push(discordUserName);
          } else if (customId === 'gather_leave') {
            currentList = currentList.filter(name => name !== discordUserName);
          }

          const newParticipantText = currentList.length > 0 ? currentList.join(', ') : '(아직 없음)';
          const newContent = `${baseContent}\n\n${delimiter}\n**참여자 목록 (${currentList.length}명)**\n${newParticipantText}`;

          return new Response(JSON.stringify({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: { content: newContent, embeds: [], components: interaction.message.components }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // 2. ✨ 체크리스트 드롭다운 및 레이드 완료 버튼 처리 (Ledger 기반)
        if (customId === 'chk_select' || customId.startsWith('chk_btn::')) {
          let charId = '';
          let toggleRaidId = null;

          if (customId === 'chk_select') {
            charId = interaction.data.values[0];
          } else {
            const parts = customId.split('::');
            charId = parts[1];
            toggleRaidId = parts[2];
          }

          let { allChars, clears, rosterRaidState } = await fetchFirebaseWithCache(env);
          const ch = allChars.find(c => c.id === charId);

          if (!ch) {
            return new Response(JSON.stringify({ type: 4, data: { content: `캐릭터를 찾을 수 없습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          }

          // 레이드 버튼 클릭 시 Ledger 엔트리 토글.
          if (toggleRaidId) {
            const existing = (clears[ch.id] || {})[toggleRaidId];
            if (existing) {
              await deleteClearEntryREST(env, clears, ch.id, toggleRaidId);
              if (clears[ch.id]) delete clears[ch.id][toggleRaidId];
            } else {
              const entry = buildClearEntry(ch, toggleRaidId);
              await writeClearEntryREST(env, clears, ch.id, entry);
              clears[ch.id] = { ...(clears[ch.id] || {}), [toggleRaidId]: entry };
            }
            firebaseCache.lastFetchTime = 0;
          }

          const userChars = allChars.filter(c => c.discordName === ch.discordName).sort((a, b) => b.itemLevel - a.itemLevel);
          const view = computeCharLedgerView(ch, clears, userChars, rosterRaidState);

          const options = userChars.slice(0, 25).map(c => ({
              label: c.lostArkName || c.jobCode,
              value: c.id,
              description: `Lv.${c.itemLevel} ${c.jobCode}`,
              default: c.id === ch.id
          }));

          // 버튼 목록 = view.raidsForChar (클리어 + 자격, family 중복은 ledger 우선).
          const buttons = view.raidsForChar.map(rId => {
              const y = view.raidYieldById[rId];
              const meta = RAID_META[rId];
              const isDone = y?.isCleared === true;
              const isTop3 = view.activeIds.has(rId);

              const baseName = meta.label;
              const statusText = isDone ? '(클리어)' : '(미완료)';
              let label = isDone ? `✅ ${baseName} ${statusText}` : `⬜ ${baseName} ${statusText}`;
              if (!isTop3) label += ' - 골드제외';

              return {
                  type: 2,
                  style: 2,
                  label,
                  custom_id: `chk_btn::${ch.id}::${rId}`
              };
          });

          const tGen = view.tGen, tBnd = view.tBnd, cGen = view.cGen, cBnd = view.cBnd;

          // ✨ 순수 JS에서는 타입 선언 없이 빈 배열로 선언하면 됩니다.
          const rows = [];
          
          rows.push({ type: 1, components: [{ type: 3, custom_id: 'chk_select', options: options, placeholder: '캐릭터를 선택해 주세요' }] });
          
          for (let i = 0; i < buttons.length; i += 5) {
              rows.push({ type: 1, components: buttons.slice(i, i + 5) });
          }

          const text = `**[${ch.lostArkName || ch.jobCode}] (Lv.${ch.itemLevel}) 숙제 현황**\n━━━━━━━━━━━━━━━━━━━━━━\n- 획득 골드: **${(cGen+cBnd).toLocaleString()} G** / ${(tGen+tBnd).toLocaleString()} G\n- 상세 내역: 일반 ${cGen.toLocaleString()}G / 귀속 ${cBnd.toLocaleString()}G\n━━━━━━━━━━━━━━━━━━━━━━\n아래 버튼을 눌러 숙제 완료/미완료 상태를 변경해 주세요.`;

          return new Response(JSON.stringify({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: { content: text, components: rows, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

      } catch (err) {
        return new Response(JSON.stringify({
          type: 4, 
          data: { content: `버튼 처리 중 에러가 발생했습니다: ${err.message}`, flags: 64 }
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ==========================================
    // 🌟 [자동완성(AUTOCOMPLETE) 처리]
    // ==========================================
    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      const commandName = interaction.data.name;
      
      let subCommandName = null;
      let actualOptions = interaction.data.options || [];
      if (actualOptions[0]?.type === 1) { 
        subCommandName = actualOptions[0].name;
        actualOptions = actualOptions[0].options || [];
      }
      
      const focusedOpt = actualOptions.find(o => o.focused);
      if (!focusedOpt) return new Response(JSON.stringify({ type: 8, data: { choices: [] } }));

      const inputVal = String(focusedOpt.value || '').toLowerCase();
      let choices = [];

      const { allChars, clears, rosterRaidState } = await fetchFirebaseWithCache(env);

      if (focusedOpt.name === '유저명') {
        const uniqueUsers = [...new Set(allChars.map(c => c.discordName).filter(Boolean))];
        choices = uniqueUsers.filter(u => u.toLowerCase().includes(inputVal)).map(u => ({ name: u, value: u }));
      }
      else if (focusedOpt.name === '캐릭명') {
        const uniqueChars = [...new Set(allChars.map(c => c.lostArkName || c.jobCode).filter(Boolean))];
        choices = uniqueChars.filter(c => c.toLowerCase().includes(inputVal)).map(c => ({ name: c, value: c }));
      }
      else if (focusedOpt.name === '레이드명') {
        if (commandName === '완료') {
          const charName = actualOptions.find(o => o.name === '캐릭명')?.value;
          if (!charName) {
            choices = [{ name: '[안내] 캐릭명을 먼저 선택해 주세요', value: 'ERROR' }];
          } else {
            const ch = allChars.find(c => (c.lostArkName === charName) || (c.jobCode === charName));
            if (!ch) {
              choices = [{ name: '[안내] 캐릭터를 찾을 수 없습니다', value: 'ERROR' }];
            } else {
              // Ledger 에 이미 있는 raid + 해당 family 는 제외.
              const userChars = allChars.filter(c => c.discordName === ch.discordName);
              const view = computeCharLedgerView(ch, clears, userChars, rosterRaidState);
              const cleared = new Set(view.ledgerEntries.map(e => e.raidId));
              const clearedFam = view.clearedFamilies;

              // 캐릭 스코프 + 원정대 스코프(대표로 지정된 경우) 모두 고려.
              const allEligible = [
                ...getTargetRaidsForCharacter(ch),
                ...getRosterRaidsForChar(ch, rosterRaidState),
              ];
              choices = allEligible
                .filter(rId => !cleared.has(rId))
                .filter(rId => !clearedFam.has(getRaidFamily(rId)))
                .filter(rId => RAID_META[rId].label.toLowerCase().includes(inputVal))
                .map(rId => ({ name: RAID_META[rId].label, value: rId }));
              if (choices.length === 0) {
                choices = [{ name: inputVal ? '검색된 남은 레이드가 없습니다' : '모든 숙제를 완료했습니다!', value: 'ERROR' }];
              }
            }
          }
        } else if (commandName === '숙제' && subCommandName === '레이드') {
          choices = Object.entries(RAID_META)
            .filter(([id, meta]) => meta.label.toLowerCase().includes(inputVal))
            .map(([id, meta]) => ({ name: meta.label, value: id }));
        }
      }

      return new Response(JSON.stringify({
        type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: { choices: choices.slice(0, 25) }
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ==========================================
    // [명령어 실행(COMMAND) 처리]
    // ==========================================
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const commandName = interaction.data.name;

      const member = interaction.member;
      const user = member ? member.user : interaction.user;
      const discordUserName = (member && member.nick) ? member.nick : (user.global_name || user.username);
      const userId = user.id;

      if (commandName === '체크리스트') {
        const targetInput = interaction.data.options?.find(o => o.name === '유저명')?.value;
        const { allChars } = await fetchFirebaseWithCache(env);
        
        // ✨ 본인 자동 인식 함수 활용
        const { chars: userChars, resolvedUserName: targetUserName } = resolveTargetUserChars(allChars, targetInput, userId, discordUserName);

        if (userChars.length === 0) {
          const errMsg = targetInput 
            ? `[오류] '${targetInput}'님의 캐릭터를 찾을 수 없습니다. 사이트에서 원정대를 등록해 주세요.` 
            : `[오류] 등록된 본인 캐릭터가 없습니다. 사이트 등록 후 이용하거나, '/체크리스트 유저명:닉네임'으로 다른 분을 검색해 주세요.`;
          return new Response(JSON.stringify({ 
            type: 4, 
            data: { content: errMsg, flags: 64 } 
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        const opts = userChars.slice(0, 25).map(c => ({
            label: c.lostArkName || c.jobCode,
            value: c.id,
            description: `Lv.${c.itemLevel} ${c.jobCode}`
        }));

        const components = [{
            type: 1,
            components: [{
                type: 3,
                custom_id: 'chk_select',
                options: opts,
                placeholder: '숙제를 관리할 캐릭터를 선택해 주세요'
            }]
        }];

        return new Response(JSON.stringify({ 
            type: 4, 
            data: { content: `**[${targetUserName}]님의 개인 숙제 체크리스트**\n아래 메뉴에서 캐릭터를 선택하면 레이드 버튼이 나타납니다.`, components: components, flags: 64 } 
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (commandName === '누적' || commandName === '주급') {
        const options = interaction.data.options || [];
        let targetInput = null;

        if (options[0]?.type === 1) {
          targetInput = options[0].options?.[0]?.value;
        } else {
          targetInput = options.find(o => o.name === '유저명')?.value;
        }

        const { allChars, clears, accumulatedGold, rosterRaidState } = await fetchFirebaseWithCache(env);

        // ✨ 본인 자동 인식 함수 활용
        const { chars: userChars, resolvedUserName: targetUserName } = resolveTargetUserChars(allChars, targetInput, userId, discordUserName);

        if (userChars.length === 0) {
          const errMsg = targetInput ? `[오류] '${targetInput}'님의 캐릭터를 찾을 수 없습니다.` : `[오류] 등록된 캐릭터가 없습니다.`;
          return new Response(JSON.stringify({
            type: 4,
            data: { content: errMsg, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Ledger 기반 주간 합산 — 각 캐릭의 top3 (획득 + 가능치) 유저 단위로 합계.
        let tGen = 0, tBnd = 0, cGen = 0, cBnd = 0;
        userChars.forEach(ch => {
          const view = computeCharLedgerView(ch, clears, userChars, rosterRaidState);
          tGen += view.tGen;
          tBnd += view.tBnd;
          cGen += view.cGen;
          cBnd += view.cBnd;
        });

        if (commandName === '누적') {
          const dbGold = accumulatedGold[targetUserName] || { general: 0, bound: 0 };
          const totalGen = Math.max(0, (dbGold.general || 0) + cGen);
          const totalBnd = Math.max(0, (dbGold.bound || 0) + cBnd);

          const resultText = `**[${targetUserName}]님의 누적 획득 골드**\n━━━━━━━━━━━━━━━━━━━━━━\n💰 **총 누적: ${(totalGen+totalBnd).toLocaleString()} G**\n\n- 일반 골드: ${totalGen.toLocaleString()} G\n- 귀속 골드: ${totalBnd.toLocaleString()} G\n━━━━━━━━━━━━━━━━━━━━━━\n*(과거 누적액 + 이번 주 획득액 합산)*`;
          return new Response(JSON.stringify({ type: 4, data: { content: resultText, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
        } 
        else if (commandName === '주급') {
          const totalPossible = tGen + tBnd;
          const totalCollected = cGen + cBnd;
          const percent = totalPossible > 0 ? Math.round((totalCollected / totalPossible) * 100) : 0;
          
          const filled = Math.floor(percent / 10);
          const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled);

          const resultText = `**[${targetUserName}]님의 주간 골드 정산**\n━━━━━━━━━━━━━━━━━━━━━━\n진행도: ${bar} (${percent}%)\n\n**총 획득 골드: ${totalCollected.toLocaleString()} G** / ${totalPossible.toLocaleString()} G\n\n- 일반 골드: ${cGen.toLocaleString()} G / ${tGen.toLocaleString()} G\n- 귀속 골드: ${cBnd.toLocaleString()} G / ${tBnd.toLocaleString()} G\n━━━━━━━━━━━━━━━━━━━━━━\n안내: 남은 숙제로 **${(totalPossible - totalCollected).toLocaleString()} G**를 더 얻을 수 있습니다!`;
          return new Response(JSON.stringify({ type: 4, data: { content: resultText, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
        }
      }

      if (commandName === '운세') {
        const now = new Date();
        const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
        const todayStr = 'day_' + kstTime.toISOString().split('T')[0].replace(/-/g, '_');

        const fortuneDocUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/fortunes?key=${env.FIREBASE_API_KEY}`;
        
        const fortuneRes = await fetch(fortuneDocUrl);
        let currentUsers = [];
        
        if (fortuneRes.ok) {
          const fortuneData = await fortuneRes.json();
          const parsedFortune = parseFirestoreDoc(fortuneData);
          if (parsedFortune[todayStr]) {
            currentUsers = parsedFortune[todayStr];
          }
        }

        if (currentUsers.includes(userId)) {
          return new Response(JSON.stringify({ 
            type: 4, 
            data: { content: `[안내] **${discordUserName}**님, 오늘의 운세를 이미 확인하셨습니다. 내일 다시 시도해 주세요! 🍀`, flags: 64 } 
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        const fortunes = [
          '[대길] 오늘은 뭘 해도 되는 날입니다. 무기 원트와 에스더의 기운이 당신을 기다립니다.',
          '[대길] 공대장의 오더가 없어도 완벽한 기믹 수행이 가능한 날입니다. 잔혈은 당신의 것입니다.',
          '[대길] 깎는 돌마다 97돌의 기운이 깃들어 있습니다. 세공사에게 당장 달려가세요.',
          '[대길] 상자 더보기를 무조건 누르세요. 에스더의 기운과 유물 각인서가 쏟아질 관상입니다.',
          '[대길] 상상 악세를 먹을 수 있는 엄청난 행운이 따르는 하루입니다.',
          '[중길] 무난하고 평화로운 하루입니다. 강화는 30% 내외로 붙을 확률이 높습니다.',
          '[중길] 숙제 빼기 딱 좋은 날입니다. 공팟에 가도 괜찮은 파티원들을 만날 수 있습니다.',
          '[중길] 경매에서 쏠쏠한 이득을 볼 대길입니다. 입찰 눈치싸움에서 승리할 것입니다.',
          '[중길] 카드팩에서 전설 카드가 하나쯤은 나와줄 만한 기분 좋은 운세입니다.',
          '[중길] 보스 몬스터의 패턴이 유독 눈에 잘 보이는 날입니다. 강투 이상의 활약을 기대하세요.',
          '[소길] 큰 이득은 없지만 손해도 없는 날입니다. 일일 숙제만 가볍게 빼는 것을 추천합니다.',
          '[소길] 장기백을 볼 뻔했지만, 70% 언저리에서 아슬아슬하게 강화가 붙을 운세입니다.',
          '[소길] 품질 업그레이드를 한 번쯤 시도해 볼 만합니다. 초록색에서 파란색으로는 갈 수 있습니다.',
          '[소길] 파티에서 딱 1인분만 해도 아무도 당신을 탓하지 않을 평범한 하루입니다.',
          '[소길] 카오스 던전에서 편린을 만날 수 있는 소소한 행운이 있습니다.',
          '[흉] 장인의 기운이 무섭게 차오릅니다. 오늘은 재련 버튼 근처에도 가지 마세요.',
          '[흉] 공팟에서 랏폿을 한 시간 이상 기다릴 관상입니다. 지인 파티를 꼭 구하세요.',
          '[흉] 억울하게 기믹 실패의 원흉으로 지목될 수 있습니다. 채팅을 아끼는 것이 좋습니다.',
          '[흉] 전리품 경매에서 실수로 0을 하나 더 입력할 수 있으니 손가락을 조심하세요.',
          '[흉] 보스의 어그로가 유독 당신에게 쏠립니다. 체력 물약을 넉넉히 챙겨가세요.',
          '[대흉] 최악의 하루. 장기백은 기본이고 깎는 돌마다 077이 뜰 것입니다. 접속 종료를 권장합니다.',
          '[대흉] 사사게 스타를 만날 확률이 99%입니다. 오늘 레이드 출발은 절대 금물입니다.',
          '[대흉] 인터넷 연결이 끊기거나 마우스 배터리가 나가서 공대에서 추방당할 수 있습니다.',
          '[대흉] 실수로 귀속 재료 대신 거래 가능 재료를 갈아버릴 수 있는 아찔한 운세입니다.',
          '[대흉] 잔혈은 커녕 투사도 못 뜰 정도로 하루 종일 누워만 있게 될 것입니다.'
        ];
        
        const colors = ['빨간색', '파란색', '노란색', '초록색', '보라색', '검은색', '흰색', '분홍색'];
        
        const randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const resultText = `**[${discordUserName}]님의 오늘의 로아 운세**\n━━━━━━━━━━━━━━━━━━━━━━\n오늘의 운세: ${randomFortune}\n\n행운의 색상: ${randomColor}\n━━━━━━━━━━━━━━━━━━━━━━\n안내: 운세는 재미로만 즐겨주세요!`;

        currentUsers.push(userId);
        const updateUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/fortunes?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=${todayStr}`;
        const payload = { fields: { [todayStr]: { arrayValue: { values: currentUsers.map(id => ({ stringValue: id })) } } } };
        
        await fetch(updateUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

        // 운세 성공은 소셜 목적이므로 공개(flags 없음)
        return new Response(JSON.stringify({ type: 4, data: { content: resultText } }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (commandName === '경매') {
        const opts = interaction.data.options || [];
        const price = opts.find(o => o.name === '가격')?.value || 0;
        const partySize = opts.find(o => o.name === '인원')?.value || 8;
        
        const afterFee = price * 0.95;
        const sellBreakeven = Math.floor((afterFee * (partySize - 1)) / partySize);
        const sellPreemptive = Math.floor(sellBreakeven * 0.91);
        const useBreakeven = Math.floor((price * (partySize - 1)) / partySize);
        const usePreemptive = Math.floor(useBreakeven * 0.91);

        const resultText = `**전리품 경매 최적가 계산** (${price.toLocaleString()} G / ${partySize}인 기준)\n━━━━━━━━━━━━━━━━━━━━━━\n**[판매 목적]** (수수료 5% 차감)\n- 손익 분기점: \`${sellBreakeven.toLocaleString()} G\`\n- **추천 선점가: \`${sellPreemptive.toLocaleString()} G\`**\n\n**[직접 사용]** (수수료 미차감)\n- 손익 분기점: \`${useBreakeven.toLocaleString()} G\`\n- **추천 선점가: \`${usePreemptive.toLocaleString()} G\`**\n━━━━━━━━━━━━━━━━━━━━━━\n안내: 추천 선점가로 입찰하면 다음 사람은 무조건 손해를 봅니다!`;

        return new Response(JSON.stringify({ type: 4, data: { content: resultText, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (commandName === '완료') {
        const options = interaction.data.options;
        const mainCharName = options.find(o => o.name === '캐릭명').value;
        const raidId = options.find(o => o.name === '레이드명').value;

        if (raidId === 'ERROR') {
          return new Response(JSON.stringify({ type: 4, data: { content: `[오류] 정상적인 레이드를 선택해 주세요.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
        }

        const companionNames = options.filter(o => o.name.startsWith('동행')).map(o => o.value);
        const allTargetNames = [mainCharName, ...companionNames];

        const { allChars, clears, rosterRaidState } = await fetchFirebaseWithCache(env);

        const targetChars = allChars.filter(c => allTargetNames.includes(c.lostArkName) || allTargetNames.includes(c.jobCode));
        if (targetChars.length === 0) {
          return new Response(JSON.stringify({ type: 4, data: { content: `[오류] 입력하신 캐릭터를 찾을 수 없습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
        }

        const meta = RAID_META[raidId];
        let resultText = '';

        if (allTargetNames.length === 1) {
          // 단일 캐릭 — 기존 엔트리 있으면 취소, 없으면 완료(ledger 기록).
          const ch = targetChars[0];
          const existing = (clears[ch.id] || {})[raidId];
          let actionText = '';
          try {
            if (existing) {
              await deleteClearEntryREST(env, clears, ch.id, raidId);
              actionText = '취소(미완료)';
            } else {
              const entry = buildClearEntry(ch, raidId);
              await writeClearEntryREST(env, clears, ch.id, entry);
              actionText = '완료';
            }
          } catch (e) {
            return new Response(JSON.stringify({ type: 4, data: { content: `[오류] 데이터베이스 업데이트에 실패했습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          }
          resultText = `**[${ch.lostArkName || ch.jobCode}]**의 **[${meta.label}]** 숙제가 **${actionText}** 처리되었습니다!`;
        } else {
          // 다중 캐릭 — 아직 미완료인 캐릭만 ledger 에 추가.
          const addedNames = [];
          for (const ch of targetChars) {
            const existing = (clears[ch.id] || {})[raidId];
            if (existing) continue;
            try {
              const entry = buildClearEntry(ch, raidId);
              await writeClearEntryREST(env, clears, ch.id, entry);
              // 다음 쓰기가 최신 clears 를 반영하도록 로컬 변수도 갱신.
              clears[ch.id] = { ...(clears[ch.id] || {}), [raidId]: entry };
              addedNames.push(ch.lostArkName || ch.jobCode);
            } catch (e) {
              // 한 개 실패해도 나머지는 계속.
            }
          }
          if (addedNames.length === 0) {
            return new Response(JSON.stringify({ type: 4, data: { content: `[안내] 선택하신 캐릭터들은 이미 **[${meta.label}]** 숙제가 완료되어 있습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          }
          resultText = `**[${meta.label}] 다중 완료 처리**\n━━━━━━━━━━━━━━━━━━━━━━\n**완료된 캐릭터:**\n${addedNames.join(', ')}\n━━━━━━━━━━━━━━━━━━━━━━\n총 ${addedNames.length}명의 숙제가 완료되었습니다!`;
        }

        firebaseCache.lastFetchTime = 0;
        return new Response(JSON.stringify({ type: 4, data: { content: resultText } }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (commandName === '숙제') {
        const subCommand = interaction.data.options[0];
        const { allChars, clears, rosterRaidState } = await fetchFirebaseWithCache(env);

        if (subCommand.name === '원정대') {
          const targetInput = subCommand.options?.[0]?.value;

          // ✨ 본인 자동 인식 함수 활용
          const { chars: userChars, resolvedUserName: userName } = resolveTargetUserChars(allChars, targetInput, userId, discordUserName);

          if (userChars.length === 0) {
            const errMsg = targetInput ? `[오류] '${targetInput}'님의 캐릭터를 찾을 수 없습니다.` : `[오류] 등록된 본인 캐릭터가 없습니다.`;
            return new Response(JSON.stringify({ type: 4, data: { content: errMsg, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          }

          let desc = '';
          userChars.forEach(ch => {
            const view = computeCharLedgerView(ch, clears, userChars, rosterRaidState);
            const remaining = view.raidsForChar.filter(rId => !view.raidYieldById[rId]?.isCleared);
            if (remaining.length === 0) return;

            const statusStr = remaining.map(rId => `**${RAID_META[rId].label}**`).join(', ');
            desc += `- [${ch.lostArkName || ch.jobCode}] (Lv.${ch.itemLevel}) : ${statusStr}\n`;
          });

          if (!desc) desc = '모든 숙제를 완료했습니다!';
          const resultText = `**[${userName}]님의 주간 숙제 현황**\n━━━━━━━━━━━━━━━━━━━━━━\n${desc}`;
          return new Response(JSON.stringify({ type: 4, data: { content: resultText, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (subCommand.name === '캐릭터') {
          const charName = subCommand.options[0].value;
          const ch = allChars.find(c => (c.lostArkName === charName) || (c.jobCode === charName));
          if (!ch) {
            return new Response(JSON.stringify({ type: 4, data: { content: `[오류] '${charName}' 캐릭터를 찾을 수 없습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          }

          const userChars = allChars.filter(c => c.discordName === ch.discordName);
          const view = computeCharLedgerView(ch, clears, userChars, rosterRaidState);
          let desc = '';
          view.raidsForChar.forEach(rId => {
            const y = view.raidYieldById[rId];
            if (!y?.isCleared) desc += `- **${RAID_META[rId].label}**\n`;
          });

          if (!desc) desc = '이번 주 숙제를 모두 완료했습니다!';
          const resultText = `**[${ch.lostArkName || ch.jobCode}] (Lv.${ch.itemLevel}) 주간 숙제**\n━━━━━━━━━━━━━━━━━━━━━━\n${desc}`;
          return new Response(JSON.stringify({ type: 4, data: { content: resultText, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (subCommand.name === '레이드') {
          const raidId = subCommand.options[0].value;
          const meta = RAID_META[raidId];
          const targetFamily = getRaidFamily(raidId);
          const targetRaid = RAIDS.find(r => r.family === targetFamily);
          const isRosterScope = targetRaid?.clearScope === 'roster';

          const remainingByUser = {};
          allChars.forEach(ch => {
            if (ch.isGuest || ch._isUserParticipating === false || ch.isParticipating === false) return;

            let eligible = false;
            if (isRosterScope) {
              // 원정대 레이드 — 이 캐릭이 해당 원정대의 대표로 지정된 경우만.
              const rosterRaids = getRosterRaidsForChar(ch, rosterRaidState);
              eligible = rosterRaids.includes(raidId);
            } else {
              const targets = getTargetRaidsForCharacter(ch);
              eligible = targets.includes(raidId);
            }
            if (!eligible) return;

            // Ledger 기반 완료 판정: 동일 family 의 어떤 tier 라도 클리어했으면 완료 간주.
            const charClears = clears[ch.id] || {};
            const clearedFamily = Object.keys(charClears).some(rId2 => charClears[rId2] && getRaidFamily(rId2) === targetFamily);
            if (clearedFamily) return;

            if (!remainingByUser[ch.discordName]) remainingByUser[ch.discordName] = [];
            remainingByUser[ch.discordName].push(`${ch.lostArkName || ch.jobCode} (${ch.itemLevel})`);
          });

          let desc = '';
          for (const [dName, chars] of Object.entries(remainingByUser)) {
             desc += `**${dName}** : ${chars.join(', ')}\n`;
          }

          if (!desc) desc = '모든 인원이 완료했습니다!';
          const resultText = `**[${meta.label}] 미완료 캐릭터 목록**\n━━━━━━━━━━━━━━━━━━━━━━\n${desc}`;

          return new Response(JSON.stringify({ type: 4, data: { content: resultText } }), { headers: { 'Content-Type': 'application/json' } });
        }
      }

      // ==========================================
      // 🌟 [/일정] 공대원 개인 일정(참여 불가일) 관리 명령어
      // 서브커맨드: 등록 / 조회 / 삭제
      //  - /일정 등록 시작일:<MMDD> 종료일:<MMDD> 사유:<텍스트>
      //  - /일정 조회 [유저명:<닉네임>]
      //  - /일정 삭제 날짜:<MMDD>
      // ==========================================
      if (commandName === '일정') {
        const subCommand = interaction.data.options?.[0];
        if (!subCommand) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `[오류] 서브커맨드를 지정해 주세요. (등록 / 조회 / 삭제)`, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        const subOptions = subCommand.options || [];
        const getOpt = (n) => subOptions.find(o => o.name === n)?.value;

        // --- 1) /일정 등록 ---
        // 옵션(모두 필수): 날짜(시작일), 종료일, 사유
        // 시작일 === 종료일 이면 단일 날짜로 처리.
        if (subCommand.name === '등록') {
          const rawStart = getOpt('시작일');
          const rawEnd = getOpt('종료일');
          const reason = getOpt('사유') || '';
          const startKey = normalizeScheduleDate(rawStart);
          const endKey = normalizeScheduleDate(rawEnd);

          if (!startKey) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[오류] 시작일은 MMDD 4자리 숫자로 입력해 주세요. (예: 0420 → 올해 4월 20일)`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }
          if (!endKey) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[오류] 종료일은 MMDD 4자리 숫자로 입력해 주세요. (예: 0425) · 단일 날짜 등록은 시작일과 같은 값을 입력하세요.`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }
          if (endKey < startKey) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[오류] 종료일은 시작일보다 빠를 수 없습니다. (시작: ${startKey} / 종료: ${endKey})`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          // 범위 내 모든 날짜 나열 (YYYY-MM-DD 문자열 비교로 안전하게 순회)
          const datesToRegister = [];
          {
            const [sy, sm, sd] = startKey.split('-').map(Number);
            const [ey, em, ed] = endKey.split('-').map(Number);
            const cur = new Date(Date.UTC(sy, sm - 1, sd));
            const end = new Date(Date.UTC(ey, em - 1, ed));
            while (cur <= end) {
              const y = cur.getUTCFullYear();
              const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
              const d = String(cur.getUTCDate()).padStart(2, '0');
              datesToRegister.push(`${y}-${m}-${d}`);
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          }

          // 중복 체크: 범위 내 어느 날이라도 이미 등록되어 있으면 에러
          const all = await fetchPersonalSchedules(env);
          const mine = all.filter(s => s.discordId === userId || s.discordName === discordUserName);
          const dupDates = datesToRegister.filter(k => mine.some(s => s.date === k));
          if (dupDates.length > 0) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[안내] 다음 날짜에 이미 등록된 일정이 있습니다: **${dupDates.join(', ')}**\n먼저 \`/일정 삭제\` 후 다시 등록해 주세요.`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          // 1) Discord 채널에 요약 메시지 1건 게시 → messageId 확보
          //    날짜엔 한글 요일을 함께 노출 (예: "2026-04-20 (월)")
          const isSingleDay = startKey === endKey;
          const dateLabel = isSingleDay
            ? formatDateWithDow(startKey)
            : `${formatDateWithDow(startKey)} ~ ${formatDateWithDow(endKey)} (${datesToRegister.length}일)`;
          const post = await postScheduleCreateMessage(env, {
            discordName: discordUserName,
            date: dateLabel,
            reason,
          });

          // 2) Firestore 에 날짜별 문서 생성 (모두 같은 messageId 공유)
          let createdCount = 0;
          for (const key of datesToRegister) {
            const ok = await createPersonalSchedule(env, {
              discordName: discordUserName,
              discordId: userId,
              date: key,
              reason,
              source: 'discord',
              discordMessageId: post.messageId || undefined,
            });
            if (ok) createdCount += 1;
          }

          if (createdCount === 0) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[오류] 데이터베이스 저장에 실패했습니다.`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: isSingleDay
                ? `**${discordUserName}**님의 **${formatDateWithDow(startKey)}** 일정이 등록되었습니다.\n- 사유: ${reason || '(미입력)'}`
                : `**${discordUserName}**님의 **${formatDateWithDow(startKey)} ~ ${formatDateWithDow(endKey)}** (${createdCount}일) 기간 일정이 등록되었습니다.\n- 사유: ${reason || '(미입력)'}`,
              flags: 64,
            }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // --- 2) /일정 조회 ---
        if (subCommand.name === '조회') {
          const targetInput = getOpt('유저명');
          const all = await fetchPersonalSchedules(env);

          // 조회 범위: 유저명 지정 시 해당 유저, 아니면 본인(우선 discordId, 없으면 닉네임)
          let filtered;
          let label;
          if (targetInput) {
            filtered = all.filter(s => s.discordName === targetInput);
            label = targetInput;
          } else {
            filtered = all.filter(s => s.discordId === userId);
            if (filtered.length === 0) filtered = all.filter(s => s.discordName === discordUserName);
            label = discordUserName;
          }

          if (filtered.length === 0) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[안내] **${label}**님의 등록된 일정이 없습니다.`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          // 오늘 이후 일정만 미래 순으로 노출
          const todayKst = normalizeScheduleDate('오늘');
          filtered.sort((a, b) => a.date.localeCompare(b.date));
          const future = filtered.filter(s => s.date >= todayKst);
          const list = (future.length > 0 ? future : filtered).slice(0, 20);

          const lines = list.map(s => `- **${formatDateWithDow(s.date)}** — ${s.reason || '(사유 미입력)'}`).join('\n');
          const resultText =
            `**[${label}]님의 등록된 일정 (${list.length}건)**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n${lines}`;

          return new Response(JSON.stringify({
            type: 4,
            data: { content: resultText, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // --- 3) /일정 삭제 ---
        if (subCommand.name === '삭제') {
          const rawDate = getOpt('날짜');
          const dateKey = normalizeScheduleDate(rawDate);
          if (!dateKey) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[오류] 날짜는 MMDD 4자리 숫자로 입력해 주세요. (예: 0420)`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          const all = await fetchPersonalSchedules(env);
          const target = all.find(s =>
            (s.discordId === userId || s.discordName === discordUserName) && s.date === dateKey
          );

          if (!target) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[안내] 해당 날짜(${dateKey})에 등록된 본인 일정이 없습니다.`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          // 1) Firestore 문서 삭제
          const ok = await deletePersonalSchedule(env, target.id);
          if (!ok) {
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `[오류] 삭제에 실패했습니다.`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } });
          }

          // 2) 등록 시 저장해 둔 Discord 메시지가 있으면 함께 삭제 (404 는 무시)
          await deleteScheduleMessageById(env, target.discordMessageId);

          return new Response(JSON.stringify({
            type: 4,
            data: { content: `**${discordUserName}**님의 **${formatDateWithDow(dateKey)}** 일정이 삭제되었습니다.`, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({
          type: 4,
          data: { content: `[오류] 알 수 없는 서브커맨드입니다.`, flags: 64 }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

      if (commandName === '초기화') {
        const permissions = interaction.member?.permissions;
        const isAdmin = permissions ? (BigInt(permissions) & 8n) === 8n : false;

        if (!isAdmin) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `[오류] 서버 관리자 권한이 필요한 명령어입니다.`, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        const options = interaction.data.options || [];
        const targetUserName = options.find(o => o.name === '유저명')?.value;
        const targetCharName = options.find(o => o.name === '캐릭명')?.value;
        const isResetAll = options.find(o => o.name === '전체')?.value;

        if (!targetUserName && !targetCharName && !isResetAll) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `[오류] 초기화 대상을 지정해 주세요. (유저명, 캐릭명, 전체 중 택 1)`, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        const { allChars, clears, accumulatedGold, rosterRaidState } = await fetchFirebaseWithCache(env);
        let targetLabel = '';

        if (isResetAll) {
          targetLabel = '전체 인원 (서버 전체)';

          // 1) Ledger 기반으로 유저별 이번 주 획득 골드 합산 → accumulatedGold 에 가산.
          const usersMap = {};
          allChars.forEach(c => {
              if (!usersMap[c.discordName]) usersMap[c.discordName] = [];
              usersMap[c.discordName].push(c);
          });

          let newGoldData = { ...accumulatedGold };
          let goldUpdated = false;

          for (const [dName, uChars] of Object.entries(usersMap)) {
              let cGen = 0, cBnd = 0;
              for (const ch of uChars) {
                  const view = computeCharLedgerView(ch, clears, uChars, rosterRaidState);
                  cGen += view.cGen;
                  cBnd += view.cBnd;
              }
              if (cGen > 0 || cBnd > 0) {
                  const userGold = newGoldData[dName] || { general: 0, bound: 0 };
                  newGoldData[dName] = {
                      general: (userGold.general || 0) + cGen,
                      bound: (userGold.bound || 0) + cBnd
                  };
                  goldUpdated = true;
              }
          }

          // 누적 골드 DB 업데이트.
          if (goldUpdated) {
              const goldPayloadFields = {};
              for (const [dName, val] of Object.entries(newGoldData)) {
                  goldPayloadFields[dName] = {
                      mapValue: { fields: {
                          general: { integerValue: val.general || 0 },
                          bound: { integerValue: val.bound || 0 }
                      } }
                  };
              }
              const updateGoldUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/accumulatedGold?key=${env.FIREBASE_API_KEY}`;
              await fetch(updateGoldUrl, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ fields: goldPayloadFields })
              });
          }

          // 2) Ledger 컬렉션 전체 비우기.
          const clearsUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/clears?key=${env.FIREBASE_API_KEY}`;
          await fetch(clearsUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: {} })
          });

          // 3) 스왑 초기화.
          const resetSwapsUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/swaps?key=${env.FIREBASE_API_KEY}&updateMask.fieldPaths=swaps`;
          await fetch(resetSwapsUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields: { swaps: { arrayValue: { values: [] } } } })
          });

          firebaseCache.lastFetchTime = 0;
          return new Response(JSON.stringify({
              type: 4,
              data: {
                  content: `**레이드 완료 내역 초기화 완료**\n━━━━━━━━━━━━━━━━━━━━━━\n대상: **${targetLabel}**\n상태: Ledger 전체가 초기화되고, 이번 주 획득 골드는 누적 골드에 안전하게 합산되었습니다.`,
                  flags: 64
              }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        // 부분 초기화 (특정 캐릭 / 특정 유저) — 해당 charId 들의 ledger 엔트리만 삭제.
        let targetIds = [];
        if (targetCharName) {
          const ch = allChars.find(c => c.lostArkName === targetCharName || c.jobCode === targetCharName);
          if (!ch) return new Response(JSON.stringify({ type: 4, data: { content: `[오류] '${targetCharName}' 캐릭터를 찾을 수 없습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          targetIds.push(ch.id);
          targetLabel = `캐릭터 [${ch.lostArkName || ch.jobCode}]`;
        } else if (targetUserName) {
          const userCharsForReset = allChars.filter(c => c.discordName === targetUserName);
          if (userCharsForReset.length === 0) return new Response(JSON.stringify({ type: 4, data: { content: `[오류] '${targetUserName}'님의 캐릭터를 찾을 수 없습니다.`, flags: 64 } }), { headers: { 'Content-Type': 'application/json' } });
          targetIds = userCharsForReset.map(c => c.id);
          targetLabel = `유저 [${targetUserName}]님의 모든 캐릭터`;
        }

        // 해당 charId 들의 ledger 엔트리 제거 — 각 charId 를 빈 맵으로 덮어씀.
        const fieldsToClear = {};
        let updateMaskPaths = [];
        for (const charId of targetIds) {
          if (clears[charId] && Object.keys(clears[charId]).length > 0) {
            fieldsToClear[charId] = { mapValue: { fields: {} } };
            updateMaskPaths.push(`updateMask.fieldPaths=${encodeURIComponent(charId)}`);
          }
        }

        if (updateMaskPaths.length === 0) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `[안내] **${targetLabel}**의 완료된 레이드 내역이 없어 이미 초기화된 상태입니다.`, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        const updateUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${env.FIRESTORE_COLLECTION}/clears?key=${env.FIREBASE_API_KEY}&${updateMaskPaths.join('&')}`;
        const patchRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fieldsToClear })
        });

        if (!patchRes.ok) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: `[오류] 초기화 중 데이터베이스 업데이트에 실패했습니다.`, flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } });
        }

        firebaseCache.lastFetchTime = 0;

        return new Response(JSON.stringify({
            type: 4,
            data: {
                content: `**레이드 완료 내역 초기화 완료**\n━━━━━━━━━━━━━━━━━━━━━━\n대상: **${targetLabel}**\n상태: 해당 캐릭터(들)의 이번 주 숙제 내역이 초기화되었습니다.`,
                flags: 64
            }
        }), { headers: { 'Content-Type': 'application/json' } });
      }

    }
    return new Response('OK');
  },
  async scheduled(event, env, ctx) {
    try {
      const botToken = env.DISCORD_BOT_TOKEN;
      const channelId = env.DISCORD_CHANNEL_ID;

      if (!botToken || !channelId) return;

      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, {
        method: 'GET',
        headers: { 'Authorization': `Bot ${botToken}` }
      });

      if (!res.ok) return;
      const messages = await res.json();

      const nowUtc = new Date();
      const kstTime = new Date(nowUtc.getTime() + (9 * 60 * 60 * 1000));
      const todayKstNum = parseInt(kstTime.toISOString().split('T')[0].replace(/-/g, ''));

      for (const msg of messages) {
        if (msg.author?.bot && msg.content.includes('파티 모집') && msg.content.includes('일시:')) {
          
          const dateLineMatch = msg.content.match(/일시:\s*(.+?)\//);
          
          if (dateLineMatch) {
            const rawDateStr = dateLineMatch[1].trim();
            const dateNumbers = rawDateStr.match(/\d+/g); 
            
            if (dateNumbers && dateNumbers.length >= 3) {
              const year = dateNumbers[0];
              const month = dateNumbers[1].padStart(2, '0');
              const day = dateNumbers[2].padStart(2, '0');
              
              const raidDateNum = parseInt(`${year}${month}${day}`);
              
              if (todayKstNum > raidDateNum) {
                await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msg.id}`, {
                  method: 'DELETE',
                  headers: { 'Authorization': `Bot ${botToken}` }
                });
                
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('오래된 모집글 삭제 중 오류 발생:', err);
    }

    // ========================================================
    // 🌟 만료된 참여 불가 일정(personalSchedules) 자동 정리
    //   - 기준: KST 오늘 날짜보다 과거면 만료
    //   - 예) 2026-04-20 까지 등록된 일정은 KST 4/21 00시 이후 크론이 돌 때 삭제됨
    //   - 기간 등록분은 같은 messageId 를 공유하므로, 해당 messageId 에 연결된
    //     모든 doc 이 과거가 되었을 때만 Discord 메시지까지 삭제 (중간 삭제는 보존)
    // ========================================================
    try {
      const nowUtc = new Date();
      const kstTime = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
      const todayKey = kstTime.toISOString().split('T')[0]; // YYYY-MM-DD (KST)

      const all = await fetchPersonalSchedules(env);
      if (all.length === 0) return;

      // messageId 별 만료 여부 계산
      const byMessage = new Map(); // messageId → { total, expired }
      for (const s of all) {
        if (!s.discordMessageId) continue;
        const stat = byMessage.get(s.discordMessageId) || { total: 0, expired: 0 };
        stat.total += 1;
        if (s.date < todayKey) stat.expired += 1;
        byMessage.set(s.discordMessageId, stat);
      }

      // 1) 만료된 Firestore 문서 삭제
      const expiredDocs = all.filter((s) => s.date < todayKey);
      for (const doc of expiredDocs) {
        await deletePersonalSchedule(env, doc.id);
        // 짧게 쉬어 Firestore Rate Limit 여유 확보
        await new Promise((r) => setTimeout(r, 150));
      }

      // 2) 모든 날짜가 만료된 Discord 메시지 삭제 (기간 등록 중간 삭제는 건너뜀)
      for (const [messageId, stat] of byMessage.entries()) {
        if (stat.total === stat.expired && messageId) {
          await deleteScheduleMessageById(env, messageId);
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    } catch (err) {
      console.error('만료된 참여 불가 일정 정리 중 오류 발생:', err);
    }
  }
}