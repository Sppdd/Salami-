import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildInsights, type CallDigest } from '../agent/insights.js';
import { models } from '../agent/nebius.js';
import { requireUser } from '../auth.js';
import { db, getOrCreateBusiness } from '../db.js';
import { twilioEnabled } from '../env.js';
import { finishCall, getOwnedCall, HttpError, respondToClient, startPhoneCall, startWebCall } from '../services/calls.js';
import { runCampaign } from '../services/campaigns.js';

const startCallBody = z.object({
  appointmentId: z.string().uuid(),
  channel: z.enum(['web', 'phone']),
});
const turnBody = z.object({ text: z.string().trim().min(1).max(1000) });
const campaignBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export async function apiRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({
    ok: true,
    twilio: twilioEnabled,
    models,
    provider: 'Nebius Token Factory',
  }));

  app.register(async (secured) => {
    secured.addHook('preHandler', requireUser);

    secured.post('/api/calls', async (req) => {
      const body = startCallBody.parse(req.body);
      if (body.channel === 'web') return startWebCall(req.userId, body.appointmentId);
      if (!twilioEnabled) throw new HttpError(400, 'Phone calls need Twilio credentials. Use the browser simulator instead.');
      return { call: await startPhoneCall(req.userId, body.appointmentId) };
    });

    secured.post<{ Params: { id: string } }>('/api/calls/:id/turn', async (req) => {
      const { text } = turnBody.parse(req.body);
      const call = await getOwnedCall(req.userId, req.params.id);
      if (call.channel !== 'web') throw new HttpError(409, 'Only browser calls accept typed or spoken turns here');
      if (call.status !== 'in_progress') throw new HttpError(409, 'This call has ended');
      const turn = await respondToClient(call, text);
      if (turn.endCall || turn.transfer) {
        void finishCall(call.id, { finalStatus: turn.transfer ? 'transferred' : undefined }).catch((e) => req.log.error(e));
      }
      return { turn };
    });

    secured.post<{ Params: { id: string } }>('/api/calls/:id/end', async (req) => {
      const call = await getOwnedCall(req.userId, req.params.id);
      void finishCall(call.id).catch((e) => req.log.error(e));
      return { ok: true };
    });

    secured.post('/api/campaigns/run', async (req) => {
      if (!twilioEnabled) throw new HttpError(400, 'Reminder campaigns place real phone calls and need Twilio credentials.');
      const { date } = campaignBody.parse(req.body ?? {});
      const { done, ...result } = await runCampaign(req.userId, date);
      done.catch((e) => req.log.error(e));
      return result;
    });

    secured.post('/api/insights', async (req) => {
      const business = await getOrCreateBusiness(req.userId);
      const calls = await db
        .from('calls')
        .select('outcome, sentiment, summary, analysis, created_at, appointments(client_name, service, starts_at)')
        .eq('owner_id', req.userId)
        .not('outcome', 'is', null)
        .order('created_at', { ascending: false })
        .limit(60);
      if (calls.error) throw new Error(calls.error.message);
      if (!calls.data.length) throw new HttpError(400, 'No analyzed calls yet. Run a few calls first.');

      const digests: CallDigest[] = calls.data.map((c) => {
        const appt = (Array.isArray(c.appointments) ? c.appointments[0] : c.appointments) as
          | { client_name: string; service: string; starts_at: string }
          | null;
        const analysis = (c.analysis ?? {}) as { risk_flags?: string[]; no_show_risk?: string };
        return {
          client: appt?.client_name ?? 'unknown',
          service: appt?.service ?? 'unknown',
          appointment_at: appt?.starts_at ?? '',
          outcome: c.outcome,
          sentiment: c.sentiment,
          summary: c.summary,
          risk_flags: analysis.risk_flags ?? [],
          no_show_risk: analysis.no_show_risk ?? null,
        };
      });
      const stats: Record<string, number> = { calls: digests.length };
      for (const d of digests) stats[`outcome_${d.outcome}`] = (stats[`outcome_${d.outcome}`] ?? 0) + 1;

      const { report, model, latencyMs } = await buildInsights(business, digests, stats);
      const saved = await db
        .from('insight_reports')
        .insert({ owner_id: req.userId, model, report, calls_analyzed: digests.length })
        .select('*')
        .single();
      if (saved.error) throw new Error(saved.error.message);
      return { ...saved.data, latency_ms: latencyMs };
    });
  });
}
