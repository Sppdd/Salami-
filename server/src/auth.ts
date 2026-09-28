import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

/** Verify the Supabase access token sent by the dashboard and attach the user id. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return reply.code(401).send({ error: 'Missing bearer token' });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return reply.code(401).send({ error: 'Invalid or expired session' });
  req.userId = data.user.id;
}
