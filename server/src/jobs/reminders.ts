/**
 * Batch job: call every unconfirmed client with an appointment tomorrow, for every business.
 *
 * Built to run as a Nebius Serverless Job on a schedule (see README), but it is a plain
 * Node entrypoint, so `npm run job:reminders` works anywhere with the same env vars.
 * The API server must stay reachable at PUBLIC_URL because Twilio webhooks drive each call.
 */
import { db } from '../db.js';
import { twilioEnabled } from '../env.js';
import { runCampaign } from '../services/campaigns.js';

if (!twilioEnabled) {
  console.error('Twilio is not configured; the reminder job places real phone calls.');
  process.exit(1);
}

const onlyDate = process.argv[2]; // optional YYYY-MM-DD override
const { data: businesses, error } = await db.from('businesses').select('owner_id, name');
if (error) throw new Error(error.message);

let total = 0;
for (const b of businesses ?? []) {
  const { done, queued, date } = await runCampaign(b.owner_id, onlyDate);
  console.log(`[reminders] ${b.name}: ${queued} call(s) for ${date}`);
  total += queued;
  await done;
}
console.log(`[reminders] finished: ${total} call(s) across ${businesses?.length ?? 0} business(es)`);
process.exit(0);
