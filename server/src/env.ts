import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === undefined || v === '' ? undefined : ['1', 'true', 'yes'].includes(v.toLowerCase()));

const schema = z.object({
  NEBIUS_API_KEY: z.string().min(1, 'NEBIUS_API_KEY is required (Nebius Token Factory)'),
  NEBIUS_BASE_URL: z.string().url().default('https://api.tokenfactory.nebius.com/v1/'),
  NEMOTRON_FAST_MODEL: z.string().default('nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'),
  NEMOTRON_SMART_MODEL: z.string().default('nvidia/NVIDIA-Nemotron-3-Super-120B-A12B'),
  NEMOTRON_REASONING_MODEL: z.string().default('nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B'),
  NEMOTRON_DISABLE_THINKING_FAST: bool,

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  TWILIO_VOICE: z.string().default('Polly.Joanna-Neural'),

  PORT: z.coerce.number().default(8080),
  PUBLIC_URL: z.string().url().default('http://localhost:8080'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CAMPAIGN_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid environment configuration:\n${issues}\nSee .env.example`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();

export const twilioEnabled = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);

export const publicUrl = env.PUBLIC_URL.replace(/\/+$/, '');
