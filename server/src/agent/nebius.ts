import { env } from '../env.js';
import { stripThinking } from './text.js';

/**
 * Minimal client for Nebius Token Factory's OpenAI-compatible Chat Completions API.
 *
 * CallVance routes every request to one of three NVIDIA Nemotron tiers:
 *  - fast      (Nano)  : live conversation turns, where latency is the product
 *  - smart     (Super) : turns the fast tier escalates (reschedule negotiation, upset clients)
 *  - reasoning (Ultra) : post-call analysis and cross-call business insights
 */
export type Tier = 'fast' | 'smart' | 'reasoning';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatResult = {
  content: string;
  model: string;
  tier: Tier;
  latencyMs: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export const models: Record<Tier, string> = {
  fast: env.NEMOTRON_FAST_MODEL,
  smart: env.NEMOTRON_SMART_MODEL,
  reasoning: env.NEMOTRON_REASONING_MODEL,
};

const baseUrl = env.NEBIUS_BASE_URL.endsWith('/') ? env.NEBIUS_BASE_URL : `${env.NEBIUS_BASE_URL}/`;

// If the endpoint rejects chat_template_kwargs once, stop sending it.
let thinkingToggleSupported = env.NEMOTRON_DISABLE_THINKING_FAST !== false;

export class NebiusError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function chat(
  tier: Tier,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<ChatResult> {
  const model = models[tier];
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: opts.maxTokens ?? (tier === 'reasoning' ? 4096 : 400),
    temperature: opts.temperature ?? (tier === 'fast' ? 0.4 : 0.2),
  };
  if (tier === 'fast' && thinkingToggleSupported) {
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const started = Date.now();
  let res = await post(body, opts.timeoutMs ?? (tier === 'reasoning' ? 120_000 : 20_000));
  if (res.status === 400 && body.chat_template_kwargs) {
    thinkingToggleSupported = false;
    delete body.chat_template_kwargs;
    res = await post(body, opts.timeoutMs ?? 20_000);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new NebiusError(`Token Factory ${res.status} for ${model}: ${detail.slice(0, 300)}`, res.status);
  }

  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string | null } }[];
    usage?: ChatResult['usage'];
  };
  const content = stripThinking(json.choices?.[0]?.message?.content ?? '');
  return { content, model: json.model ?? model, tier, latencyMs: Date.now() - started, usage: json.usage };
}

function post(body: Record<string, unknown>, timeoutMs: number) {
  return fetch(`${baseUrl}chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NEBIUS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
