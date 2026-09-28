import { supabase } from './supabase';
import type { Call, Health, InsightReport } from './types';

const base = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

export class ApiError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export type AgentTurn = {
  say: string;
  intent: string;
  proposedTime: string | null;
  endCall: boolean;
  transfer: boolean;
  model: string;
  tier: string;
  latencyMs: number;
  escalated: boolean;
};

export const api = {
  health: () => request<Health>('/api/health'),
  startCall: (appointmentId: string, channel: 'web' | 'phone') =>
    request<{ call: Call; greeting?: AgentTurn }>('/api/calls', {
      method: 'POST',
      body: JSON.stringify({ appointmentId, channel }),
    }),
  sendTurn: (callId: string, text: string) =>
    request<{ turn: AgentTurn }>(`/api/calls/${callId}/turn`, { method: 'POST', body: JSON.stringify({ text }) }),
  endCall: (callId: string) => request<{ ok: true }>(`/api/calls/${callId}/end`, { method: 'POST', body: '{}' }),
  runCampaign: (date?: string) =>
    request<{ date: string; queued: number }>('/api/campaigns/run', {
      method: 'POST',
      body: JSON.stringify(date ? { date } : {}),
    }),
  insights: () => request<InsightReport & { latency_ms: number }>('/api/insights', { method: 'POST', body: '{}' }),
};
