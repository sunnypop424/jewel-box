import type { RaidSwap } from '../types';
import { BASE_URL } from './sheetApi';

interface SwapResponse {
  ok: boolean;
  swaps?: RaidSwap[];
  error?: string;
}

async function parseJson(res: Response): Promise<SwapResponse> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as SwapResponse;
  if (!data.ok) throw new Error(data.error || 'Swap API error');
  return data;
}

export async function fetchSwaps(): Promise<RaidSwap[]> {
  if (!BASE_URL) return [];
  const url = new URL(BASE_URL);
  url.searchParams.set('action', 'getSwaps');
  const res = await fetch(url.toString());
  const data = await parseJson(res);
  return data.swaps || [];
}

export async function addSwap(
  raidId: string,
  charId1: string,
  charId2: string,
  updatedBy?: string
): Promise<RaidSwap[]> {
  if (!BASE_URL) return [];
  const payload = { action: 'addSwap', raidId, charId1, charId2, updatedBy };
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  return data.swaps || [];
}

export async function resetSwaps(): Promise<RaidSwap[]> {
  if (!BASE_URL) return [];
  const payload = { action: 'resetSwaps' };
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const data = await parseJson(res);
  return data.swaps || [];
}