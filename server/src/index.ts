import { buildApp } from './app.js';
import { env, publicUrl, twilioEnabled } from './env.js';
import { models } from './agent/nebius.js';

const app = await buildApp();
await app.listen({ port: env.PORT, host: '0.0.0.0' });
app.log.info({ models, twilio: twilioEnabled, publicUrl }, '811 API ready (Nemotron on Nebius Token Factory)');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().finally(() => process.exit(0));
  });
}
