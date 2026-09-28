import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { greeting, type AgentTurn } from '../agent/conversation.js';
import { speakable } from '../agent/text.js';
import { addTurn, getCall, getOrCreateBusiness, updateCall, type Business, type Call, type CallStatus } from '../db.js';
import { env, publicUrl } from '../env.js';
import { callContext, finishCall, recordAgentLine, respondToClient } from '../services/calls.js';
import { isValidTwilioRequest, VoiceResponse } from '../services/twilio.js';

type TwilioReq = FastifyRequest<{ Querystring: { callId?: string; r?: string }; Body: Record<string, string> }>;

// Twilio's typings enumerate every voice name; ours comes from config.
const say = { voice: env.TWILIO_VOICE, language: 'en-US' } as unknown as Parameters<InstanceType<typeof VoiceResponse>['say']>[0];

function twiml(reply: FastifyReply, vr: InstanceType<typeof VoiceResponse>) {
  return reply.type('text/xml').send(vr.toString());
}

/** Speak a line and listen for the reply; Twilio posts the transcription to /twilio/gather. */
function listen(vr: InstanceType<typeof VoiceResponse>, callId: string, line: string, retries = 0) {
  const gather = vr.gather({
    input: ['speech'],
    action: `${publicUrl}/twilio/gather?callId=${callId}&r=${retries}`,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    language: 'en-US',
    actionOnEmptyResult: true,
  });
  gather.say(say, speakable(line));
}

function respond(vr: InstanceType<typeof VoiceResponse>, call: Call, business: Business, turn: AgentTurn) {
  if (turn.transfer) {
    if (business.front_desk_phone) {
      vr.say(say, speakable(turn.say));
      vr.dial({ timeout: 25 }, business.front_desk_phone);
      return;
    }
    vr.say(say, `${speakable(turn.say)} Our front desk will call you back shortly. Goodbye!`);
    vr.hangup();
    return;
  }
  if (turn.endCall) {
    vr.say(say, speakable(turn.say));
    vr.hangup();
    return;
  }
  listen(vr, call.id, turn.say);
}

export async function twilioRoutes(app: FastifyInstance) {
  // Every Twilio webhook must carry a valid signature for our public URL.
  app.addHook('preHandler', async (req: TwilioReq, reply) => {
    const signature = req.headers['x-twilio-signature'] as string | undefined;
    if (!isValidTwilioRequest(signature, req.url, req.body ?? {})) {
      req.log.warn({ url: req.url }, 'rejected Twilio webhook with bad signature');
      return reply.code(403).send('Forbidden');
    }
  });

  async function loadCall(req: TwilioReq): Promise<Call | null> {
    const id = req.query.callId;
    if (!id) return null;
    const call = await getCall(id);
    if (!call || (call.twilio_call_sid && req.body.CallSid && call.twilio_call_sid !== req.body.CallSid)) return null;
    return call;
  }

  app.post('/twilio/voice', async (req: TwilioReq, reply) => {
    const vr = new VoiceResponse();
    const call = await loadCall(req);
    if (!call) {
      vr.hangup();
      return twiml(reply, vr);
    }
    await updateCall(call.id, { status: 'in_progress', started_at: new Date().toISOString() });

    const { business, appt } = await callContext(call);
    if ((req.body.AnsweredBy ?? '').startsWith('machine')) {
      // Privacy: never leave appointment details on a voicemail.
      const line = `Hi, this is ${business.agent_name} from ${business.name} with a quick reminder. Please call us back at your convenience. Thank you!`;
      await addTurn(call, { role: 'system', content: 'Answering machine detected; left a generic callback message.' });
      await addTurn(call, { role: 'agent', content: line, model: 'template', tier: 'template', latency_ms: 0 });
      vr.say(say, line);
      vr.hangup();
      return twiml(reply, vr);
    }

    const opening = greeting(business, appt);
    await recordAgentLine(call, opening);
    listen(vr, call.id, opening.say);
    return twiml(reply, vr);
  });

  app.post('/twilio/gather', async (req: TwilioReq, reply) => {
    const vr = new VoiceResponse();
    const call = await loadCall(req);
    if (!call) {
      vr.hangup();
      return twiml(reply, vr);
    }
    const speech = (req.body.SpeechResult ?? '').trim();
    const retries = Number(req.query.r ?? 0);

    if (!speech) {
      if (retries >= 2) {
        vr.say(say, "I'm sorry, I'm having trouble hearing you. We'll try you again later. Goodbye!");
        vr.hangup();
      } else {
        listen(vr, call.id, "Sorry, I didn't catch that. Will you be able to make your appointment?", retries + 1);
      }
      return twiml(reply, vr);
    }

    const turn = await respondToClient(call, speech);
    if (turn.transfer) await updateCall(call.id, { status: 'transferred' });
    respond(vr, call, await getOrCreateBusiness(call.owner_id), turn);
    return twiml(reply, vr);
  });

  app.post('/twilio/status', async (req: TwilioReq, reply) => {
    const call = await loadCall(req);
    if (!call) return reply.code(204).send();
    const status = req.body.CallStatus;
    const duration = req.body.CallDuration ? Number(req.body.CallDuration) : undefined;

    if (status === 'ringing' && call.status === 'queued') {
      await updateCall(call.id, { status: 'ringing' });
    } else if (status === 'completed') {
      await finishCall(call.id, { durationSeconds: duration, finalStatus: call.status === 'transferred' ? 'transferred' : undefined });
    } else if (status === 'busy' || status === 'no-answer' || status === 'failed' || status === 'canceled') {
      const map: Record<string, CallStatus> = { busy: 'busy', 'no-answer': 'no_answer', failed: 'failed', canceled: 'failed' };
      await finishCall(call.id, { finalStatus: map[status], durationSeconds: duration });
    }
    return reply.code(204).send();
  });
}
