# Deploying 811

811 is one Docker container (API + Twilio webhooks + dashboard) plus a Supabase project. All AI calls go to NVIDIA Nemotron on Nebius Token Factory, which satisfies the hackathon's "runs on Nebius" requirement wherever the container itself is hosted. Hosting the container on Nebius as well (steps 4–5) is recommended but optional.

## 1. Supabase (database, login, live updates)

1. Create a project at supabase.com.
2. **SQL Editor** → paste and run `supabase/migrations/0001_init.sql`.
3. **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key.
4. **Authentication → URL Configuration**: set **Site URL** to your public app URL (the one from step 4), and add it under **Redirect URLs**.
5. For a demo, you can turn off **Confirm email** under **Authentication → Providers → Email**, so judges can sign up instantly.

## 2. Nebius Token Factory (the models)

1. Create an API key in Token Factory.
2. In the model catalog, find the NVIDIA Nemotron models you want for each tier and copy their **exact** IDs:
   - `NEMOTRON_FAST_MODEL`: Nano (live call turns)
   - `NEMOTRON_SMART_MODEL`: Super (escalations)
   - `NEMOTRON_REASONING_MODEL`: Ultra (post-call audit, insights)
3. Quick check before deploying (should return a reply, not an error):
   ```bash
   curl https://api.tokenfactory.nebius.com/v1/chat/completions \
     -H "Authorization: Bearer $NEBIUS_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"<your Nano model id>","messages":[{"role":"user","content":"Say hi"}]}'
   ```

## 3. Build the container

```bash
docker build -t 811 \
  --build-arg VITE_SUPABASE_URL=<Supabase project URL> \
  --build-arg VITE_SUPABASE_ANON_KEY=<Supabase anon key> .
```

Test it locally first:

```bash
docker run --rm -p 8080:8080 --env-file .env 811
# open http://localhost:8080
```

## 4. Host it on Nebius

1. In the Nebius console, create a **Container Registry**. Log in with the `docker login` command it shows, then tag and push:
   ```bash
   docker tag 811 <registry-address>/811:latest
   docker push <registry-address>/811:latest
   ```
2. Create a **Serverless Endpoint** (or a small AI Cloud VM running Docker) from that image:
   - port **8080**, at least one instance kept warm (a sleeping instance would miss Twilio webhooks mid-call)
   - environment variables: everything in `.env.example` **except** the `VITE_*` ones (they are baked in at build time)
3. When it's running, copy its public **https** URL and set `PUBLIC_URL` to exactly that URL (no trailing slash). Redeploy so the variable takes effect.
4. Check `https://<your-url>/api/health`. It should report your three model IDs.

Any other container host (Railway, Fly.io, Render…) works the same way: same image, same variables, same `PUBLIC_URL` rule.

## 5. Nightly reminder calls (optional)

Create a **Nebius Serverless Job** from the same image, on a schedule (for example every day at 17:00 in your time zone):

- command: `node server/dist/jobs/reminders.js`
- same environment variables as the endpoint

It calls every patient with an unconfirmed appointment tomorrow. The endpoint from step 4 must stay running, because Twilio sends each live call's audio back to it.

## 6. Real phone calls (optional)

The browser call simulator works without this.

1. In Twilio, buy a phone number with **Voice** capability.
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` (E.164, e.g. `+14155550100`) on the endpoint, then redeploy.
3. There is nothing to configure on the number itself: 811 passes its webhook URLs on each call it places.
4. Trial accounts can only call numbers you have verified in Twilio.
5. In the app, add your front-desk number under **Agent & business** to enable live transfers.

## 7. Final checklist

- [ ] Sign up on the live URL, click **Load demo day**, run a **Simulate** call end to end
- [ ] The call's post-call analysis appears and the appointment status updates live
- [ ] **Insights → Generate report** works
- [ ] The repository is public and the MIT license shows on its page
- [ ] The demo video (≤ 3 min, public on YouTube) shows Token Factory and Nemotron in use
