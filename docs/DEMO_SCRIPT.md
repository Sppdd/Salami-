# 3-minute demo video script

**0:00–0:20 · Problem.** "No-shows cost appointment businesses hours of revenue, and reminder calls eat front-desk time. SalamAI is an AI phone agent that confirms, reschedules and audits appointments. It runs on NVIDIA Nemotron through Nebius Token Factory."

**0:20–0:45 · Setup.** Sign up. Point out that the business is created automatically. Show **Agent & business**: pick "Clinic", and the persona and policies fill in. Back on the dashboard, click **Load demo day**. Point at the sidebar's Nemotron panel, which lists the Nano, Super and Ultra model IDs served by Token Factory.

**0:45–1:45 · Live call.** On **Appointments**, click **Simulate** for James Carter. The agent greets him by voice. Say "Hmm, can we move it to Thursday afternoon?" and let it offer real open slots. Accept one. Point out the tier badge on each line: Nano for normal turns, Super when a reschedule escalates, with latency shown. Say "Great, thanks, bye". The call ends and the "auditing" spinner appears.

**1:45–2:15 · Audit.** Ultra's analysis card appears with the outcome (rescheduled), sentiment, no-show risk and follow-ups. The appointment row updates live to its new time, showing "was …". Show the dashboard feed and the per-tier latency panel. Optionally, run a second call and ask "Can I talk to a person?" to show a transfer.

**2:15–2:45 · Insights and export.** On **Insights**, click **Generate report**. Walk through Ultra's patterns, recommendations and at-risk clients. Then use **Export CSV** on **Calls**.

**2:45–3:00 · Close.** "Real phone calls use Twilio with signed webhooks. The whole app is one container on Nebius Serverless Endpoints, with a scheduled Nebius Serverless Job that calls tomorrow's clients every evening."
