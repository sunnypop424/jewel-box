import React from 'react';
import { Shield, Swords, X } from 'lucide-react';
import type { Character, RaidId } from '../types';

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: { raidId: RaidId; char: Character } | null;
  allCharacters: Character[];
  onConfirm: (targetCharId: string) => void;
}

/**
 * 캐릭터가 특정 레이드에 실제로 배정될 대상인지 확인하는 함수입니다.
 * raidLogic.ts의 getTargetRaidsForCharacter 로직을 그대로 따라갑니다.
 */
function isCharacterTargetForRaid(char: Character, targetRaidId: RaidId): boolean {
  const il = char.itemLevel;

  // 1. 지평의 성당
  if (targetRaidId.startsWith('HORIZON_')) {
    if (il >= 1750) return targetRaidId === 'HORIZON_STEP3';
    if (il >= 1720) return targetRaidId === 'HORIZON_STEP2';
    if (il >= 1700) return targetRaidId === 'HORIZON_STEP1';
  }

  // 1. 세르카 (Serka) - 1740+ & 나메체크 시 나메, 그 외 1730+ 하드, 1710+ 노말
  if (targetRaidId.startsWith('SERKA_')) {
    if (il >= 1740 && char.serkaNightmare) return targetRaidId === 'SERKA_NIGHTMARE';
    if (il >= 1730) return targetRaidId === 'SERKA_HARD';
    if (il >= 1710) return targetRaidId === 'SERKA_NORMAL';
  }

  // 2. 종막 (Final) - 1730+ 하드, 1710+ 노말
  if (targetRaidId.startsWith('FINAL_')) {
    if (il >= 1730) return targetRaidId === 'FINAL_HARD';
    if (il >= 1710) return targetRaidId === 'FINAL_NORMAL';
  }

  // 3. 4막 (Act 4) - 1720+ 하드, 1700+ 노말
  if (targetRaidId.startsWith('ACT4_')) {
    if (il >= 1720) return targetRaidId === 'ACT4_HARD';
    if (il >= 1700) return targetRaidId === 'ACT4_NORMAL';
  }

  return false;
}

export const SwapModal: React.FC<SwapModalProps> = ({
  isOpen,
  onClose,
  target,
  allCharacters,
  onConfirm,
}) => {
  if (!isOpen || !target) return null;

  // 교체 후보 필터링: 같은 유저이면서, 현재 레이드 난이도에 딱 맞는 캐릭터만 노출
  const swapCandidates = allCharacters.filter((c) => {
    return (
      c.discordName === target.char.discordName && // 같은 유저
      c.id !== target.char.id && // 자기 자신 제외
      isCharacterTargetForRaid(c, target.raidId) // 해당 레이드 난이도 대상자인지 확인
    );
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b bg-zinc-50 px-4 py-3 font-bold dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          <span>캐릭터 변경</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-bold text-zinc-900 dark:text-zinc-100">
              {target.char.jobCode}
            </span>
            ({target.char.discordName}) 캐릭터를 교체할 캐릭터를 선택하세요.
            <br />
            <span className="text-[11px] text-indigo-500 font-medium">
              * 레이드 배정 기준에 따라 이 레이드를 가는 캐릭터만 표시됩니다.
            </span>
          </p>

          <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto pr-1 scrollbar-thin">
            {swapCandidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs text-zinc-400">교체 가능한 캐릭터가 없습니다.</p>
                <p className="text-[10px] text-zinc-500 mt-1">이 난이도를 가도록 설정된 다른 캐릭터가 있는지 확인해주세요.</p>
              </div>
            ) : (
              swapCandidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onConfirm(c.id)}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded text-[10px] ${
                        c.role === 'SUPPORT'
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {c.role === 'SUPPORT' ? <Shield size={12} /> : <Swords size={12} />}
                    </span>
                    <span className="text-sm font-bold dark:text-zinc-200">
                      {c.jobCode}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold dark:text-zinc-300">Lv.{c.itemLevel}</div>
                    <div className="text-[10px] text-zinc-400">CP {c.combatPower.toLocaleString()}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
};