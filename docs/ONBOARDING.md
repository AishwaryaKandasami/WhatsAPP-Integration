# Onboarding a new food client (<30 minutes)

The bot is **single-tenant**: one Vercel deploy serves one kitchen. Adding a client
means a new deploy + config + menu — **no code changes**. This runbook takes a new
kitchen from "yes" to live.

> Target: 1–3 clients this way. Multi-tenancy (one deploy, many kitchens) is a
> future step, deliberately not built yet.

## What you need from the client

- Business name (English, and Tamil if they have one)
- Location / delivery areas
- Today's menu: items with prices, grouped by breakfast / lunch / dinner
- Which meals they serve (breakfast? lunch? dinner?)
- Minimum order value
- The WhatsApp number customers will message (must be a number they control and can
  connect to the Meta Cloud API)
- The owner's personal WhatsApp number (where confirmed orders are sent)

## Steps

### 1. Create the deploy (~5 min)
- Clone/fork this project into a new Vercel project (or use one Vercel project per
  client). Point it at the same repo, `main` branch.
- Reuse the shared Supabase project, or create a per-client one for stricter data
  isolation (recommended once you have paying clients).

### 2. Set environment variables (~5 min)
In the Vercel project's **Environment Variables**, set everything from
[`.env.local.example`](../.env.local.example). The food-specific ones:

| Var | Value |
|-----|-------|
| `BOT_MODE` | `food` |
| `SELLER_BUSINESS_NAME` | the client's name — **this is what the bot greets customers with** |
| `SELLER_WHATSAPP_NUMBER` | owner's number for order alerts (e.g. `9198…`) |
| `SELLER_LOCATION`, `SELLER_WORKING_HOURS` | client details |
| `KITCHEN_PIN` | a fresh PIN for their `/kitchen/menu` page |
| `GROQ_API_KEY` | (optional) enables the AI fallback |
| `ALERT_WEBHOOK_URL` | (optional) Slack/Discord webhook for failure alerts |

Plus the Meta (`META_*`) and Supabase (`NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) values. Never commit these — Vercel env only.

### 3. Seed the business config + menu (~10 min)
- In Supabase, set the single `food_business_config` row: `business_name`,
  `delivery_areas`, `minimum_order`, and the `serves_breakfast/lunch/dinner` flags.
- Add the client's dishes to `menu_items` (name, description, price, `meal_type`).
- Open `/kitchen/menu`, unlock with `KITCHEN_PIN`, and toggle today's available
  items on. (The owner does this daily going forward.)

### 4. Connect WhatsApp (~5 min, + Meta verification lead time)
- In the Meta App dashboard, set the webhook callback to
  `https://<deploy>/api/webhooks/whatsapp` with your `META_WEBHOOK_VERIFY_TOKEN`,
  subscribed to `messages`.
- A **test number** (5 recipients) works immediately for a pilot. A **public** demo
  or production launch needs a verified Meta Business number — start that process
  early (it can take ~2–4 weeks).

### 5. Smoke test (~5 min)
- From a test phone, message the number: `menu` → order an item → confirm.
- Confirm the order lands on `SELLER_WHATSAPP_NUMBER`.
- Reply `PREPARING` from the owner number → the customer should get a status update.
- Check the order appears in the kitchen dashboard.

## Note on the public demo persona

`/demo/food` is branded **"Amma's Kitchen"** in its header. The bot's greeting text
comes from `SELLER_BUSINESS_NAME`. If you run the public marketing demo on its own
deploy, set `SELLER_BUSINESS_NAME=Amma's Kitchen` so the greeting matches the header.
A real client's deploy uses their own name, and their customers order over WhatsApp
(not the demo page).
