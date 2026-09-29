# 811

**An AI phone agent that confirms, reschedules and audits appointments, powered by NVIDIA Nemotron on Nebius Token Factory.**

License: MIT · Track: **Best Apps and Agents** · Stack: Nemotron 3 (Nano / Super / Ultra) on Nebius Token Factory · Supabase (Postgres, Auth, Realtime) · Fastify · React · Twilio Voice (optional)

---

## The problem

Clinics, salons, auto shops and law offices lose revenue to no-shows. The usual fix is front-desk staff spending hours a day on reminder calls. Most of those calls are routine ("yes, I'll be there"). The hard ones need judgment: moving an appointment to a time that is actually free, handling an upset client, or knowing when to hand off to a human.

## What 811 does

1. **Import your schedule.** Upload a CSV or add appointments by hand. Common column names from booking exports are recognized.
2. **The agent calls every unconfirmed client.** It uses a real phone call through Twilio, or the **in-browser call simulator**, which needs no phone setup and is ideal for judging.
3. **It holds a natural conversation.** It confirms, cancels, answers policy questions, and **reschedules only into slots that are actually open** on your calendar. When a client asks for a human, it transfers the live call to your front desk.
4. **Every call is audited after it ends.** A reasoning model reads the transcript and decides what the client actually agreed to. It writes a structured outcome, sentiment, no-show risk and follow-ups, then updates the appointment automatically.
5. **Everything streams live.** Statuses and transcripts reach the dashboard in real time through Supabase Realtime, with CSV export for calls and appointments.
6. **Insights.** Nemotron Ultra reads across recent calls. It explains why clients cancel, when they prefer to rebook, who is at risk of not showing up, and how to adjust the agent's script.

## How NVIDIA Nemotron and Nebius Token Factory are used

811 routes each job to the Nemotron tier that fits its latency and reasoning needs. All three tiers are served by **Nebius Token Factory** through its OpenAI-compatible API (`server/src/agent/nebius.ts`).

| Tier | Default model (configurable) | Used for | Why this tier |
|---|---|---|---|
| **fast** | Nemotron 3 **Nano** | Every live conversational turn | On a phone line, latency matters most. The fast tier runs with thinking disabled and returns a compact JSON action (`say`, `intent`, `proposed_time`, `end_call`, `escalate`). |
| **smart** | Nemotron 3 **Super** | Escalated turns | Nano can flag a turn as complex (negotiation, complaint). The server also escalates on malformed output, or when Nano names a time that is not a real open slot. Super then re-answers that turn. |
| **reasoning** | Nemotron 3 **Ultra** | Post-call audit and business insights reports | Runs after the call, off the latency-critical path. It turns messy transcripts into auditable, structured outcomes and finds patterns across many calls. |

Design choices that make the models safe in production:

- **Calendar grounding.** The server computes real open slots (business hours, time zone, existing bookings, minimum notice). The model may only pick from that list, and `matchSlot()` rejects any other time. A made-up time can never be booked.
- **Two independent judgments.** The live agent's claimed outcome isn't trusted. Ultra re-derives the outcome from the transcript, and a reschedule to a time that was never offered becomes `needs_followup`.
- **Stateless turns.** The transcript in Postgres is the conversation state. Any server instance can handle any turn, so it scales horizontally.
- **Voicemail privacy.** On answering-machine detection, the agent leaves only a generic callback message with no appointment details.
- **Robust parsing.** `<think>` traces, markdown fences and trailing commas are handled (`server/src/agent/text.ts`, unit-tested).
- **Visible routing.** Every agent line stores its model, tier and latency. The dashboard shows per-tier usage and latency, and each transcript line shows which Nemotron model produced it.

## Architecture

```
            ┌───────────────────────────── React dashboard (Vite + Tailwind) ─────────────────────────────┐
            │  Appointments · CSV import/export · Browser call simulator (Web Speech) · Live feed · Insights │
            └───────────────┬───────────────────────────────────────────────▲─────────────────────────────┘
                REST (Supabase JWT)                                 Supabase Realtime (RLS-scoped)
                            │                                               │
┌───────────────────────────▼──────────────────────┐        ┌───────────────┴──────────────┐
│ Fastify API (Node 22, TypeScript)                │        │ Supabase                     │
│  /api/calls, /turn, /end, /campaigns, /insights  │◄──────►│  Postgres + RLS + Auth       │
│  /twilio/voice, /gather, /status (signed)        │        │  businesses, appointments,   │
│  Agent: slots · conversation · analysis · insights│       │  calls, call_turns, reports  │
└───────┬──────────────────────────────┬───────────┘        └──────────────────────────────┘
        │ OpenAI-compatible            │ TwiML <Gather speech> / <Say> / <Dial>
┌───────▼─────────────────────┐   ┌────▼──────────────┐
│ Nebius Token Factory        │   │ Twilio Voice      │  (optional; the simulator works without it)
│ Nemotron Nano/Super/Ultra   │   └───────────────────┘
└─────────────────────────────┘
```

```
server/src/
  agent/nebius.ts         Token Factory client, 3-tier routing
  agent/conversation.ts   live turn: Nano first, escalate to Super
  agent/analysis.ts       post-call audit on Ultra
  agent/insights.ts       cross-call report on Ultra
  agent/slots.ts          time-zone-aware open-slot computation (tested)
  agent/text.ts           think-stripping, JSON extraction, TTS cleanup, E.164 (tested)
  services/calls.ts       call lifecycle, exactly-once finish + analysis
  services/campaigns.ts   "call tomorrow's clients" with a concurrency limit
  routes/twilio.ts        signed Twilio webhooks
  jobs/reminders.ts       batch entrypoint for Nebius Serverless Jobs
web/src/pages/            Dashboard, Appointments, CallRoom, Calls, Insights, Settings
supabase/migrations/      schema, RLS policies, realtime publication
```

## Run it locally

**Prerequisites:** Node 22.9+, a [Supabase](https://supabase.com) project, and a [Nebius Token Factory](https://tokenfactory.nebius.com) API key.

1. **Database.** In the Supabase SQL editor, run `supabase/migrations/0001_init.sql` (or use `supabase db push`). This creates the tables, row level security policies and realtime publication.
2. **Configure.**
   ```bash
   cp .env.example .env
   ```
   Fill in `NEBIUS_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the matching `VITE_SUPABASE_*` values. Copy the exact Nemotron model IDs you want for each tier from the Token Factory model catalog into `NEMOTRON_FAST_MODEL`, `NEMOTRON_SMART_MODEL` and `NEMOTRON_REASONING_MODEL`. The dashboard sidebar shows which models are active.
3. **Install and start.**
   ```bash
   npm install
   npm run dev          # API on :8080, dashboard on :5173
   ```
4. **Try it.** Open http://localhost:5173, sign up, and click **Load demo day** on the dashboard. On **Appointments**, click **Simulate** on any row. The agent speaks through your browser, and you answer by microphone (Chrome/Edge) or by typing. Try *"Can we move it to Thursday afternoon?"*, *"I need to cancel"* or *"Can I talk to a person?"*. End the call and watch the Ultra audit update the appointment live. Then generate an **Insights** report.

### Real phone calls (optional)

Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`. Set `PUBLIC_URL` to a public https URL for the API, such as your deployment or a tunnel like `ngrok http 8080`. This URL must match exactly, because webhook signatures are validated against it. Trial Twilio accounts can only call verified numbers. **Call** buttons and **Call tomorrow's clients** then become active. If you add a front-desk number in **Agent & business**, transfers ring through live.

### Tests and checks

```bash
npm test          # slot computation, JSON extraction, TTS cleanup, phone normalization
npm run typecheck
npm run build
```

## Deploy on Nebius

The `Dockerfile` builds one container that serves the API, the Twilio webhooks and the dashboard on a single origin.

```bash
docker build -t 811 \
  --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
```

- **Nebius Serverless Endpoints.** Push the image to Nebius Container Registry and create an endpoint on port 8080 with the server env vars from `.env.example`. Set `PUBLIC_URL` to the endpoint URL.
- **Nebius Serverless Jobs.** Schedule the same image with the command `node server/dist/jobs/reminders.js` (optionally followed by `YYYY-MM-DD`). It calls every unconfirmed client with an appointment tomorrow, across all businesses. The endpoint must stay up, because Twilio webhooks drive each live call.

## Security

- The browser gets only the Supabase anon key. Row level security limits every read to the signed-in owner, and calls, turns and reports are read-only for users.
- The API verifies the Supabase JWT on every `/api/*` request and checks call ownership. The service-role key never leaves the server.
- Twilio webhooks are rejected unless `X-Twilio-Signature` validates. The API is rate-limited, and request bodies are validated with zod.

## Feedback on Nebius Token Factory and NVIDIA Nemotron

- **OpenAI compatibility.** Token Factory is a drop-in for the Chat Completions API, so we used a small `fetch` client with no SDK. Switching tiers only means changing a model string, which made the three-tier router easy to build and to swap models per tier.
- **Tiering fits voice.** A phone agent has two very different workloads: sub-second conversational turns, and careful judgment about what the client actually agreed to. With one catalog serving small, medium and large Nemotron models, each can get the right model without juggling providers.
- **Reasoning traces.** Some Nemotron variants emit `<think>` content inline. A documented, uniform way to disable or separate reasoning across all hosted Nemotron models would simplify clients. We send `chat_template_kwargs` and fall back gracefully if it is rejected.
- **Wish list.** Guaranteed JSON-schema output for every Nemotron model, and published per-model latency percentiles to help size a voice agent.

## License

[MIT](LICENSE)
