# OrderGenie — WhatsApp AI ordering bot for food businesses

An AI "employee" for home kitchens, cloud kitchens, and tiffin services. Customers
message the business's WhatsApp number and the bot takes their order end-to-end —
in **English, Tamil, or Tanglish** — then drops the confirmed order on the owner's
phone. Built for Tamil Nadu D2C sellers.

**Live surfaces**
- `/` — marketing landing page (pitch, ROI calculator, pricing)
- `/demo/food` — interactive demo a prospect can try in the browser
- `/api/webhooks/whatsapp` — the WhatsApp Cloud API webhook (the real bot)
- `/kitchen/menu` — PIN-protected menu manager for the owner

## How it works (3-layer hybrid)

The bot minimizes AI cost by handling the common path deterministically and only
calling an LLM when it has to:

1. **FAQ router** (`src/lib/flow/faq-router.ts`) — fixed answers for delivery
   questions. No AI.
2. **Flow state machine** (`src/lib/flow/food-flow.ts`) — button/list-driven order
   flow: pick meal → add items → cart → delivery/pickup → address → confirm. No AI
   on the happy path.
3. **AI fallback** (`src/lib/ai/groq-fallback.ts`) — only fires when the flow can't
   parse free text (e.g. messy Tanglish). Uses Groq, and degrades to a safe canned
   reply if AI is unavailable, so the bot never breaks.

Confirmed orders are saved to Supabase and forwarded to the owner's WhatsApp. The
owner can reply with a keyword (`PREPARING`, `OUT`, `DONE`) to advance the order and
auto-notify the customer.

## Tech stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind v4
- **Supabase** (Postgres) — conversations, messages, orders, menu
- **AI:** Google Gemini (primary, used by other flows) + Groq `llama-3.1-8b-instant`
  (food fallback). _Note: an earlier plan referenced Claude; the shipped code uses
  Gemini + Groq for cost._
- **WhatsApp:** Meta Cloud API (direct, no BSP)
- **Hosting:** Vercel

> ⚠️ This repo pins **Next.js 16.2.6**, which has breaking changes vs. older docs.
> Before editing Next.js code, read the relevant guide under
> `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

`npm run lint` and `npx tsc --noEmit` should both pass before you push.

## Configuration

All per-deploy config lives in environment variables — see
[`.env.local.example`](.env.local.example) for the full annotated list. The bot is
**single-tenant**: one deploy serves one business, selected by `BOT_MODE` and the
`SELLER_*` values.

## Onboarding a new client

See [`docs/ONBOARDING.md`](docs/ONBOARDING.md) for the <30-minute runbook to take a
new kitchen live (clone the deploy, set env, seed the menu, connect WhatsApp).
