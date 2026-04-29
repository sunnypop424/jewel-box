import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { PoolMemberInput } from './PoolMemberInput';
import type {
  CompeteCriterion,
  MissionType,
  NewMission,
  PoolLuckRule,
} from '../types';
import { ChevronDown, Coins, Crosshair, Dice5, Swords } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  allUserNames: string[];
  onCreate: (data: NewMission) => Promise<void>;
}

const TYPE_OPTIONS: { value: MissionType; label: string; description: string; Icon: typeof Crosshair }[] = [
  { value: 'DIRECT', label: '1:1 미션', description: '특정 1명에게 거는 미션', Icon: Crosshair },
  { value: 'POOL_LUCK', label: '운빨/조건 미션', description: '풀에서 운/조건으로 1명 결정', Icon: Dice5 },
  { value: 'POOL_COMPETE', label: '경쟁 미션', description: 'N명 중 1등 지목', Icon: Swords },
];

const LUCK_RULES: { value: PoolLuckRule; label: string }[] = [
  { value: 'RANDOM', label: '랜덤 (룰렛)' },
  { value: 'LOWEST_HP', label: '잔혈' },
  { value: 'MAIN_MVP', label: '메인 MVP' },
  { value: 'CUSTOM', label: '직접 입력' },
];

const COMPETE_CRITERIA: { value: CompeteCriterion; label: string }[] = [
  { value: 'TOP_DPS', label: '딜 1등' },
  { value: 'CUSTOM', label: '직접 입력' },
];

// === 표준 클래스 토큰 ===
const LABEL_CLS =
  'mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400';

const INPUT_CLS =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors placeholder:font-medium placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';

const SELECT_CLS = `${INPUT_CLS} appearance-none pr-10 cursor-pointer`;

const PILL_BASE = 'rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors';
const PILL_ACTIVE = 'bg-indigo-600 text-white shadow-sm';
const PILL_INACTIVE =
  'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700';

const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/25 transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50';
const SECONDARY_BTN =
  'inline-flex items-center justify-center rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700';

const SelectChevron = () => (
  <ChevronDown
    size={14}
    strokeWidth={3}
    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
  />
);

export const MissionCreateModal: React.FC<Props> = ({ isOpen, onClose, allUserNames, onCreate }) => {
  const [type, setType] = useState<MissionType>('DIRECT');
  const [issuer, setIssuer] = useState<string>('');
  const [title, setTitle] = useState('');
  const [goldAmount, setGoldAmount] = useState<string>('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState<string>('');
  const [poolMembers, setPoolMembers] = useState<string[]>(['', '']);
  const [poolLuckRule, setPoolLuckRule] = useState<PoolLuckRule>('RANDOM');
  const [competeCriterion, setCompeteCriterion] = useState<CompeteCriterion>('TOP_DPS');
  const [customCriterion, setCustomCriterion] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달이 닫힐 때 폼 리셋.
  useEffect(() => {
    if (!isOpen) {
      setType('DIRECT');
      setIssuer('');
      setTitle('');
      setGoldAmount('');
      setDescription('');
      setTarget('');
      setPoolMembers(['', '']);
      setPoolLuckRule('RANDOM');
      setCompeteCriterion('TOP_DPS');
      setCustomCriterion('');
      setError(null);
    }
  }, [isOpen]);

  const cleanedPoolMembers = useMemo(
    () => poolMembers.map((n) => n.trim()).filter((n) => n.length > 0),
    [poolMembers],
  );

  const handleSubmit = async () => {
    setError(null);
    if (!issuer.trim()) return setError('미션을 거는 사람을 선택해주세요.');
    // POOL 타입은 룰/기준 자체가 미션 정체성이므로 title 비어있어도 OK.
    // DIRECT 는 title 이 미션 내용이므로 필수.
    if (type === 'DIRECT' && !title.trim()) return setError('미션 제목을 입력해주세요.');
    const amount = Number(goldAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('미션 금액은 양수로 입력해주세요.');

    if (type === 'DIRECT' && !target.trim()) {
      return setError('대상자를 선택해주세요.');
    }
    if (type !== 'DIRECT' && cleanedPoolMembers.length < 2) {
      return setError('후보군은 2명 이상 입력해주세요.');
    }
    if (
      (type === 'POOL_LUCK' && poolLuckRule === 'CUSTOM') ||
      (type === 'POOL_COMPETE' && competeCriterion === 'CUSTOM')
    ) {
      if (!customCriterion.trim()) return setError('직접 입력 기준 내용을 적어주세요.');
    }

    const data: NewMission = {
      issuer: issuer.trim(),
      type,
      title: title.trim(),
      goldAmount: Math.floor(amount),
      description: description.trim() || undefined,
      target: type === 'DIRECT' ? target.trim() : undefined,
      poolMembers: type !== 'DIRECT' ? cleanedPoolMembers : undefined,
      poolLuckRule: type === 'POOL_LUCK' ? poolLuckRule : undefined,
      competeCriterion: type === 'POOL_COMPETE' ? competeCriterion : undefined,
      customCriterion:
        (type === 'POOL_LUCK' && poolLuckRule === 'CUSTOM') ||
        (type === 'POOL_COMPETE' && competeCriterion === 'CUSTOM')
          ? customCriterion.trim()
          : undefined,
    };

    try {
      setSubmitting(true);
      await onCreate(data);
      onClose();
    } catch (e) {
      setError('미션 생성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} title="미션 걸기" onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex flex-col gap-5">
        {/* 타입 선택 */}
        <div>
          <label className={LABEL_CLS}>미션 종류</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:bg-indigo-950/30 dark:ring-indigo-900'
                      : 'border-zinc-200 bg-white hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900/50'
                  }`}
                >
                  <opt.Icon
                    size={18}
                    className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}
                  />
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{opt.label}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 미션 건 사람 */}
        <div>
          <label className={LABEL_CLS}>미션 건 사람</label>
          <div className="relative">
            <select value={issuer} onChange={(e) => setIssuer(e.target.value)} className={SELECT_CLS}>
              <option value="">선택...</option>
              {allUserNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <SelectChevron />
          </div>
        </div>

        {/* 제목 / 금액 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
          <div>
            <label className={LABEL_CLS}>
              {type === 'DIRECT' ? '미션 제목' : '추가 조건 (선택)'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === 'DIRECT'
                  ? '예: 솔로 일리아칸 클리어'
                  : '예: 무공시, 5분컷 (없으면 비워두세요)'
              }
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>
              <Coins size={11} className="mr-1 inline" />
              미션 금액
            </label>
            <input
              type="number"
              value={goldAmount}
              onChange={(e) => setGoldAmount(e.target.value)}
              placeholder="10000"
              className={INPUT_CLS}
            />
          </div>
        </div>

        {/* 타입별 분기 폼 */}
        {type === 'DIRECT' && (
          <div>
            <label className={LABEL_CLS}>대상자</label>
            <div className="relative">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={SELECT_CLS}>
                <option value="">선택...</option>
                {allUserNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <SelectChevron />
            </div>
          </div>
        )}

        {type === 'POOL_LUCK' && (
          <>
            <PoolMemberInput value={poolMembers} onChange={setPoolMembers} allUserNames={allUserNames} />
            <div>
              <label className={LABEL_CLS}>결정 방식</label>
              <div className="flex flex-wrap gap-2">
                {LUCK_RULES.map((r) => {
                  const active = poolLuckRule === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setPoolLuckRule(r.value)}
                      className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              {poolLuckRule === 'CUSTOM' && (
                <input
                  type="text"
                  value={customCriterion}
                  onChange={(e) => setCustomCriterion(e.target.value)}
                  placeholder="예: 광전사 토템 깬 사람"
                  className={`${INPUT_CLS} mt-2`}
                />
              )}
            </div>
          </>
        )}

        {type === 'POOL_COMPETE' && (
          <>
            <PoolMemberInput value={poolMembers} onChange={setPoolMembers} allUserNames={allUserNames} />
            <div>
              <label className={LABEL_CLS}>경쟁 기준</label>
              <div className="flex flex-wrap gap-2">
                {COMPETE_CRITERIA.map((c) => {
                  const active = competeCriterion === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCompeteCriterion(c.value)}
                      className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {competeCriterion === 'CUSTOM' && (
                <input
                  type="text"
                  value={customCriterion}
                  onChange={(e) => setCustomCriterion(e.target.value)}
                  placeholder="예: 다이브 가장 많이"
                  className={`${INPUT_CLS} mt-2`}
                />
              )}
            </div>
          </>
        )}

        <div>
          <label className={LABEL_CLS}>상세 설명 (선택)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="자세한 조건이나 메모"
            className={INPUT_CLS}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onClose} disabled={submitting} className={SECONDARY_BTN}>
            취소
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting} className={PRIMARY_BTN}>
            {submitting ? '등록 중...' : '미션 등록'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
