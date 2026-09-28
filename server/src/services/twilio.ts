import twilio from 'twilio';
import { env, publicUrl, twilioEnabled } from '../env.js';

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!twilioEnabled) throw new Error('Twilio is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)');
  client ??= twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
  return client;
}

export async function placeOutboundCall(callId: string, to: string): Promise<string> {
  const call = await getClient().calls.create({
    to,
    from: env.TWILIO_FROM_NUMBER!,
    url: `${publicUrl}/twilio/voice?callId=${callId}`,
    method: 'POST',
    statusCallback: `${publicUrl}/twilio/status?callId=${callId}`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    machineDetection: 'Enable',
    timeout: 25,
  });
  return call.sid;
}

/** Verify X-Twilio-Signature against the public URL Twilio actually called. */
export function isValidTwilioRequest(signature: string | undefined, path: string, params: Record<string, string>): boolean {
  if (!twilioEnabled || !signature) return false;
  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN!, signature, `${publicUrl}${path}`, params);
}

export const VoiceResponse = twilio.twiml.VoiceResponse;
