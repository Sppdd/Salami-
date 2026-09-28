import type { Appointment, Business, CallTurn } from '../db.js';
import { chat } from './nebius.js';
import { formatLocal, matchSlot, type Slot } from './slots.js';
import { extractJson } from './text.js';

export const OUTCOMES = ['confirmed', 'rescheduled', 'cancelled', 'needs_followup', 'no_answer', 'voicemail'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type CallAnalysis = {
  outcome: Outcome;
  rescheduled_to: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  client_requests: string[];
  follow_up_actions: string[];
  risk_flags: string[];
  no_show_risk: 'low' | 'medium' | 'high';
  confidence: number;
  model: string;
  latency_ms: number;
};

/**
 * Post-call analysis on the reasoning tier (Nemotron Ultra). Runs after the call, off the
 * latency-critical path, and turns a messy transcript into a structured, auditable outcome
 * that drives the appointment's status.
 */
export async function analyzeCall(
  business: Business,
  appt: Appointment,
  turns: Pick<CallTurn, 'role' | 'content'>[],
  slots: Slot[],
): Promise<CallAnalysis> {
  const transcript = turns
    .filter((t) => t.role !== 'system')
    .map((t) => `${t.role === 'agent' ? 'AGENT' : 'CLIENT'}: ${t.content}`)
    .join('\n');

  const prompt = [
    `You audit appointment-confirmation calls for ${business.name}.`,
    `Appointment: ${appt.service} for ${appt.client_name} on ${formatLocal(appt.starts_at, business.timezone)}.`,
    `Slots the agent was allowed to offer:`,
    slots.map((s) => `- ${s.label} => ${s.iso}`).join('\n') || '- none',
    ``,
    `Transcript:`,
    transcript || '(no conversation)',
    ``,
    `Decide what the CLIENT actually agreed to (not what the agent assumed).`,
    `- "rescheduled" only if the client explicitly accepted one of the listed slots; put its exact ISO value in rescheduled_to.`,
    `- "needs_followup" if the outcome is ambiguous, the client asked for a human, or wanted a time not on the list.`,
    `- "voicemail" if an answering machine or wrong person picked up; "no_answer" if nobody spoke.`,
    `- no_show_risk reflects hesitation, conflicts or repeated reschedules in the transcript.`,
    ``,
    `Return ONLY this JSON:`,
    `{"outcome": "confirmed"|"rescheduled"|"cancelled"|"needs_followup"|"no_answer"|"voicemail", "rescheduled_to": string|null, "sentiment": "positive"|"neutral"|"negative", "summary": string (1-2 sentences for front-desk staff), "client_requests": string[], "follow_up_actions": string[], "risk_flags": string[], "no_show_risk": "low"|"medium"|"high", "confidence": number (0-1)}`,
  ].join('\n');

  const result = await chat('reasoning', [
    { role: 'system', content: 'You are a precise call auditor. Think carefully, then output only JSON.' },
    { role: 'user', content: prompt },
  ]);
  const raw = extractJson<Partial<CallAnalysis>>(result.content);
  if (!raw) throw new Error(`reasoning tier returned no JSON: ${result.content.slice(0, 200)}`);
  return normalizeAnalysis(raw, slots, result.model, result.latencyMs);
}

export function normalizeAnalysis(
  raw: Partial<CallAnalysis>,
  slots: Slot[],
  model: string,
  latencyMs: number,
): CallAnalysis {
  let outcome: Outcome = OUTCOMES.includes(raw.outcome as Outcome) ? (raw.outcome as Outcome) : 'needs_followup';
  const slot = matchSlot(raw.rescheduled_to ?? null, slots);
  // A reschedule to a time we never offered cannot be booked automatically.
  if (outcome === 'rescheduled' && !slot) outcome = 'needs_followup';
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 8) : []);
  const confidence = typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5;
  return {
    outcome,
    rescheduled_to: outcome === 'rescheduled' ? slot!.iso : null,
    sentiment: raw.sentiment === 'positive' || raw.sentiment === 'negative' ? raw.sentiment : 'neutral',
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : 'No summary available.',
    client_requests: list(raw.client_requests),
    follow_up_actions: list(raw.follow_up_actions),
    risk_flags: list(raw.risk_flags),
    no_show_risk: raw.no_show_risk === 'high' || raw.no_show_risk === 'medium' ? raw.no_show_risk : 'low',
    confidence,
    model,
    latency_ms: latencyMs,
  };
}
