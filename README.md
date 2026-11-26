# Heartbeat (Netlify edition)

Alerts you when an automation goes quiet. Everything runs on Netlify: a static dashboard, serverless functions, Netlify Blobs for storage and a scheduled function for alerts. No separate server.

## Deploy
Use Git or the Netlify CLI. Drag-and-drop is not reliable here because the functions have an npm dependency that must be installed at build time.

1. Push this folder to a GitHub repo, then in Netlify choose **Add new site, Import an existing project**. `netlify.toml` already sets the publish folder; leave the build command empty.
2. In **Site configuration, Environment variables**, add:
   - `HEARTBEAT_PASSWORD`: your dashboard password
   - `HEARTBEAT_INGEST_TOKEN`: a long random string your workflows will send
   - `SESSION_SECRET`: another long random string (`openssl rand -hex 32`)
   - Optional: `SLACK_WEBHOOK_URL` for alerts, `GEMINI_API_KEY` (and `GEMINI_MODEL`) for LLM diagnosis
3. Redeploy. Environment values are frozen per deploy, so any change needs a new deploy.
4. Open your site and sign in. Share `https://YOUR-SITE/?demo=1` publicly: it shows simulated data and needs no login.

CLI alternative: `npm i -g netlify-cli && netlify deploy --build --prod`

## Sharing the link
Netlify sites are public: anyone with the URL can open it. Visitors to the main address see the sign-in page only. Share `https://YOUR-SITE/?demo=1` for a no-login demo. Never share your password, ingest token or session secret. You can rename the site under Site configuration, Site details.

## Connect a workflow
```bash
curl -X POST https://YOUR-SITE/ping/nightly-backup \
  -H "X-Heartbeat-Token: $HEARTBEAT_INGEST_TOKEN" -H "Content-Type: application/json" -d '{"ok": true}'
```
Send `{"ok": false, "error": "..."}` to report a failure. Workflows appear after their first ping.

## How it works
- `netlify/functions/api.mjs` serves `/ping/*`, `/api/*`, `/login`, `/logout`. Login uses a signed HttpOnly cookie. Workflows use the ingest token.
- `netlify/functions/check.mjs` runs every 5 minutes, alerts once when a workflow turns bad, and deletes runs older than 8 days. Scheduled functions only run on the published production deploy.
- Each run is one Blob, so simultaneous pings never overwrite each other.
- `web/assets/engine.js` holds the health rules, shared by the browser demo and the functions.

## Limits
Built for small teams (tens of workflows). It lists Blobs to evaluate health, so very high ping volumes would need a database. Check Netlify's current plan limits for functions and Blobs.

## Test
`npm test` (no network needed).
