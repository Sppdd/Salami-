import type { Appointment, Business, CallTurn } from '../db.js';
import { chat, type ChatMessage, type ChatResult, type Tier } from './nebius.js';
import { formatLocal, matchSlot, type Slot } from './slots.js';
import { extractJson, speakable } from './text.js';

export type Intent =
  | 'confirm'
  | 'reschedule'
  | 'cancel'
  | 'question'
  | 'transfer'
  | 'wrong_person'
  | 'other';

export type AgentTurn = {
  say: string;
  intent: Intent;
  proposedTime: string | null;
  endCall: boolean;
  transfer: boolean;
  model: string;
  tier: Tier | 'template';
  latencyMs: number;
  escalated: boolean;
};

type RawTurn = {
  say?: string;
  intent?: string;
  proposed_time?: string | null;
  end_call?: boolean;
  escalate?: boolean;
};

const INTENTS: Intent[] = ['confirm', 'reschedule', 'cancel', 'question', 'transfer', 'wrong_person', 'other'];

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Deterministic opening line: zero latency when the client picks up. */
export function greeting(business: Business, appt: Appointment): AgentTurn {
  const when = formatLocal(appt.starts_at, business.timezone);
  const withWho = appt.provider ? ` with ${appt.provider}` : '';
  return {
    say:
      `Hi ${firstName(appt.client_name)}, this is ${business.agent_name}, the virtual assistant from ${business.name}. ` +
      `I'm calling about your ${appt.service}${withWho} on ${when}. Will you be able to make it?`,
    intent: 'other',
    proposedTime: null,
    endCall: false,
    transfer: false,
    model: 'template',
    tier: 'template',
    latencyMs: 0,
    escalated: false,
  };
}

export function systemPrompt(business: Business, appt: Appointment, slots: Slot[], now: Date): string {
  const slotList = slots.length
    ? slots.map((s) => `- ${s.label} => ${s.iso}`).join('\n')
    : '- (no open slots this week: offer to have the front desk call back)';
  return [
    `You are ${business.agent_name}, a phone assistant for ${business.name} (${business.business_type}).`,
    `Personality: ${business.agent_persona}`,
    `You are on a live PHONE call. Replies are spoken aloud by text-to-speech: one or two short sentences, no lists, no markdown, no emoji.`,
    ``,
    `Goal: confirm, reschedule or cancel this appointment, answer simple questions, then politely end the call.`,
    `Client: ${appt.client_name}`,
    `Appointment: ${appt.service}${appt.provider ? ` with ${appt.provider}` : ''} on ${formatLocal(appt.starts_at, business.timezone)} (${appt.duration_minutes} minutes).`,
    appt.notes ? `Notes on file: ${appt.notes}` : '',
    `Business policies: ${business.policies}`,
    `Current time: ${formatLocal(now.toISOString(), business.timezone)} (${business.timezone}).`,
    ``,
    `Open slots you may offer for rescheduling (offer at most two or three at a time, ONLY from this list):`,
    slotList,
    ``,
    `Rules:`,
    `- Never invent times, prices, medical, legal or account details. If unsure, offer a transfer to the front desk.`,
    `- If the client agrees to a new time, repeat it back and set proposed_time to the exact ISO value from the list.`,
    `- If you reached the wrong person or voicemail, apologize briefly and end the call without sharing appointment details.`,
    `- If the client asks for a human, is upset, or has a request you cannot handle, set intent "transfer".`,
    `- Set end_call true only after saying goodbye, once the outcome is clear.`,
    `- Set escalate true when the request is complex (multiple constraints, negotiation, complaint) and a stronger model should answer.`,
    ``,
    `Respond with ONLY a JSON object, no other text:`,
    `{"say": string, "intent": "confirm"|"reschedule"|"cancel"|"question"|"transfer"|"wrong_person"|"other", "proposed_time": string|null, "end_call": boolean, "escalate": boolean}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function toMessages(system: string, turns: Pick<CallTurn, 'role' | 'content'>[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  for (const t of turns) {
    if (t.role === 'system') continue;
    messages.push({ role: t.role === 'agent' ? 'assistant' : 'user', content: t.content });
  }
  // Chat templates expect the conversation to end on a user turn.
  if (messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: '(silence)' });
  }
  return messages;
}

type ParsedTurn = Omit<AgentTurn, 'escalated'> & { wantsEscalation: boolean; parsed: boolean; rawProposed: string | null };

function strip({ wantsEscalation: _w, parsed: _p, rawProposed: _r, ...turn }: ParsedTurn): Omit<AgentTurn, 'escalated'> {
  return turn;
}

export function parseTurn(result: ChatResult, slots: Slot[]): ParsedTurn {
  const raw = extractJson<RawTurn>(result.content);
  const parsed = Boolean(raw && typeof raw.say === 'string' && raw.say.trim());
  const say = parsed ? raw!.say! : result.content;
  const intent = INTENTS.includes(raw?.intent as Intent) ? (raw!.intent as Intent) : 'other';
  const slot = matchSlot(raw?.proposed_time ?? null, slots);
  return {
    say: speakable(say) || 'Sorry, could you say that again?',
    intent,
    proposedTime: slot?.iso ?? null,
    endCall: Boolean(raw?.end_call),
    transfer: intent === 'transfer',
    model: result.model,
    tier: result.tier,
    latencyMs: result.latencyMs,
    wantsEscalation: Boolean(raw?.escalate),
    parsed,
    rawProposed: typeof raw?.proposed_time === 'string' && raw.proposed_time.trim() ? raw.proposed_time : null,
  };
}

/**
 * One conversational turn. The fast tier (Nemotron Nano) answers first; if it asks to
 * escalate, returns malformed output, or proposes a reschedule time that is not a real
 * open slot, the smart tier (Nemotron Super) re-answers the same turn.
 */
export async function agentTurn(
  business: Business,
  appt: Appointment,
  history: Pick<CallTurn, 'role' | 'content'>[],
  slots: Slot[],
  now = new Date(),
): Promise<AgentTurn> {
  const messages = toMessages(systemPrompt(business, appt, slots, now), history);

  let fast: ParsedTurn | null = null;
  try {
    fast = parseTurn(await chat('fast', messages), slots);
  } catch (err) {
    console.warn('[agent] fast tier failed, escalating:', (err as Error).message);
  }

  // The fast tier named a time that is not on the calendar: don't let it promise that slot.
  const invalidSlot = Boolean(fast?.rawProposed) && fast?.proposedTime === null;
  const needsEscalation = !fast || !fast.parsed || fast.wantsEscalation || invalidSlot;

  if (fast && !needsEscalation) return { ...strip(fast), escalated: false };

  try {
    const smart = strip(parseTurn(await chat('smart', messages, { maxTokens: 600 }), slots));
    return { ...smart, latencyMs: smart.latencyMs + (fast?.latencyMs ?? 0), escalated: true };
  } catch (err) {
    console.error('[agent] smart tier failed:', (err as Error).message);
    if (fast?.parsed) return { ...strip(fast), escalated: false };
    return {
      say: `I'm sorry, I'm having trouble on my end. Someone from ${business.name} will call you back shortly. Goodbye!`,
      intent: 'other',
      proposedTime: null,
      endCall: true,
      transfer: false,
      model: 'fallback',
      tier: 'template',
      latencyMs: 0,
      escalated: false,
    };
  }
}
