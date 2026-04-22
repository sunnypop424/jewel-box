// =============================================================================
// Cloudflare Worker 레이드 블록 생성 스크립트
// -----------------------------------------------------------------------------
// 목적: src/data/raids.ts 의 레이드 레지스트리 + top3 공식을 Worker (순수 JS)
//       에 붙여 넣을 수 있는 스니펫으로 출력한다. 웹앱과 Worker 간 드리프트
//       방지.
//
// 사용법:
//   npm run gen:worker-raids              # 표준출력으로 스니펫 인쇄
//   npm run gen:worker-raids -- --write   # dist/worker-raids.generated.js
//
// 교체 규칙:
//   cloudflareworker.js 의 다음 두 마커 사이 블록을 이 스니펫으로 교체한다.
//     // === GEN:RAID-LEDGER-BEGIN ===
//     ... (자동 생성 내용) ...
//     // === GEN:RAID-LEDGER-END ===
//
// 스니펫이 emit 하는 것:
//   RAID_META, RAIDS,
//   isWithinAvailability, getTargetRaidsForCharacter, getRosterRaidsForChar,
//   getRaidFamily, computeIgnoreBound, computeCharLedgerView
// =============================================================================

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const raidsEntry = path.join(projectRoot, 'src', 'data', 'raids.ts');

// 1. raids.ts 를 ESM 으로 번들
const result = await build({
  entryPoints: [raidsEntry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  target: 'es2022',
});

// 2. 번들 결과를 임시 파일로 쓰고 dynamic import
const tmpDir = path.join(os.tmpdir(), 'jewel-box-raids-gen');
await mkdir(tmpDir, { recursive: true });
const tmpFile = path.join(tmpDir, `raids-${Date.now()}.mjs`);
await writeFile(tmpFile, result.outputFiles[0].text);
const mod = await import(pathToFileURL(tmpFile).href);

const { RAIDS, RAID_META } = mod;

// 3. Worker용 RAID_META — Worker 계산에 필요한 필드만.
//    legacy gold/goldType/partySize 는 Worker 에서 사용하지 않으므로 제외.
const workerRaidMeta = Object.fromEntries(
  Object.entries(RAID_META).map(([id, m]) => [id, {
    label: m.label,
    generalGold: m.generalGold,
    boundGold: m.boundGold,
  }])
);

// 4. Worker용 RAIDS — 스케줄 판정에 필요한 필드만 (clearScope 포함).
const workerRaidsSlim = RAIDS.map((r) => ({
  family: r.family,
  clearScope: r.clearScope,
  availableFrom: r.availableFrom ?? null,
  availableUntil: r.availableUntil ?? null,
  difficulties: r.difficulties.map((d) => ({
    tier: d.tier,
    minItemLevel: d.minItemLevel,
    requiresFlag: d.requiresFlag ?? null,
  })),
}));

// 5. 스니펫 생성 — cloudflareworker.js 의 GEN:RAID-LEDGER 블록 교체용
const snippet = `// === GEN:RAID-LEDGER-BEGIN ===
// 자동 생성: npm run gen:worker-raids
// 원본: src/data/raids.ts — 직접 수정하지 말 것.

const RAID_META = ${JSON.stringify(workerRaidMeta, null, 2)};

const RAIDS = ${JSON.stringify(workerRaidsSlim, null, 2)};

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
    const qualified = raid.difficulties.filter((d) => {
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
    const q = raid.difficulties.filter(d => {
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
    const isSplit = y.general > 0 && y.bound > 0;
    tGen += y.general;
    if (!ignoreBound || isSplit) tBnd += y.bound;
    if (y.isCleared) {
      cGen += y.general;
      if (!ignoreBound || isSplit) cBnd += y.bound;
    }
  }

  const raidsForChar = activeYields.map(y => y.id);
  const raidYieldById = {};
  for (const y of activeYields) raidYieldById[y.id] = y;

  return { ignoreBound, ledgerEntries, clearedFamilies, activeYields, activeIds, cGen, cBnd, tGen, tBnd, raidsForChar, raidYieldById };
}

// === GEN:RAID-LEDGER-END ===
`;

// 6. 출력
const shouldWrite = process.argv.includes('--write');

process.stdout.write(snippet);

if (shouldWrite) {
  const outDir = path.join(projectRoot, 'dist');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'worker-raids.generated.js');
  await writeFile(outFile, snippet);
  process.stderr.write(`\n[gen-worker-raids] Wrote ${outFile}\n`);
}
