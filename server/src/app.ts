import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { env } from './env.js';
import { apiRoutes } from './routes/api.js';
import { twilioRoutes } from './routes/twilio.js';
import { HttpError } from './services/calls.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  });
  await app.register(formbody);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    // Twilio webhooks are signature-checked and must never be throttled mid-call.
    allowList: (req) => req.url.startsWith('/twilio/'),
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Invalid request', issues: err.issues });
    const statusCode = err instanceof HttpError ? err.statusCode : err.statusCode ?? 500;
    if (statusCode >= 500) req.log.error(err);
    return reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal error' : err.message });
  });

  await app.register(apiRoutes);
  await app.register(twilioRoutes);

  // Serve the built dashboard from the same origin in production.
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/twilio')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
