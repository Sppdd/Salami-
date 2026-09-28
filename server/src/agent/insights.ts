import type { Business } from '../db.js';
import { chat } from './nebius.js';
import { extractJson } from './text.js';

export type InsightReport = {
  headline: string;
  highlights: string[];
  patterns: { title: string; detail: string }[];
  recommendations: { title: string; detail: string; impact: 'high' | 'medium' | 'low' }[];
  at_risk: { client: string; reason: string }[];
  script_suggestions: string[];
};

export type CallDigest = {
  client: string;
  service: string;
  appointment_at: string;
  outcome: string | null;
  sentiment: string | null;
  summary: string | null;
  risk_flags: string[];
  no_show_risk: string | null;
};

/**
 * Cross-call business insights on the reasoning tier (Nemotron Ultra): why clients
 * cancel, when they prefer to rebook, who is likely to no-show, and how to tune the agent.
 */
export async function buildInsights(
  business: Business,
  digests: CallDigest[],
  stats: Record<string, number>,
): Promise<{ report: InsightReport; model: string; latencyMs: number }> {
  const prompt = [
    `You are an operations analyst for ${business.name}, a ${business.business_type}.`,
    `The AI phone agent "${business.agent_name}" calls clients to confirm appointments.`,
    `Aggregate stats: ${JSON.stringify(stats)}`,
    ``,
    `Recent analyzed calls (most recent first):`,
    JSON.stringify(digests),
    ``,
    `Find non-obvious, actionable patterns (timing, services, reasons for cancelling or rescheduling, sentiment).`,
    `Be specific and ground every claim in the data; say so if the sample is too small.`,
    `Return ONLY this JSON:`,
    `{"headline": string, "highlights": string[], "patterns": [{"title": string, "detail": string}], "recommendations": [{"title": string, "detail": string, "impact": "high"|"medium"|"low"}], "at_risk": [{"client": string, "reason": string}], "script_suggestions": string[]}`,
  ].join('\n');

  const result = await chat('reasoning', [
    { role: 'system', content: 'You are a rigorous analyst. Reason step by step privately, then output only JSON.' },
    { role: 'user', content: prompt },
  ], { maxTokens: 6000 });

  const raw = extractJson<Partial<InsightReport>>(result.content);
  if (!raw) throw new Error(`reasoning tier returned no JSON: ${result.content.slice(0, 200)}`);
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).slice(0, 8) : []);
  return {
    report: {
      headline: raw.headline ?? 'Insights',
      highlights: arr<string>(raw.highlights),
      patterns: arr(raw.patterns),
      recommendations: arr(raw.recommendations),
      at_risk: arr(raw.at_risk),
      script_suggestions: arr<string>(raw.script_suggestions),
    },
    model: result.model,
    latencyMs: result.latencyMs,
  };
}
