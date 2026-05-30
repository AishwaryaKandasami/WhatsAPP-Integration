# Technical Documentation

## Architecture Overview

```
Customer (WhatsApp)
    |
    v
Meta Cloud API
    |
    v
POST /api/webhooks/whatsapp  (Next.js API Route)
    |
    +-- Verify HMAC signature (META_APP_SECRET)
    +-- Extract message text
    +-- Get/create conversation (Supabase)
    +-- Fetch conversation history (last 10 messages)
    |
    +-- BOT_MODE check
    |   |
    |   +-- "food" --> processFoodMessage() --> Gemini 2.5 Flash
    |   |                                         |
    |   |                                    Tool calls:
    |   |                                    - get_todays_menu
    |   |                                    - search_menu
    |   |                                    - confirm_order --> saveFoodOrder()
    |   |
    |   +-- "embroidery" --> processMessage() --> Gemini 2.5 Flash
    |                                              |
    |                                         Tool calls:
    |                                         - search_catalog
    |                                         - get_all_designs
    |                                         - create_order
    |                                         - get_pricing
    |
    +-- Send reply via sendTextReply()
    +-- If order confirmed --> notifySeller()
    +-- Store messages in Supabase
    |
    v
Return 200 OK (Meta requires fast response)
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16.2.6 (App Router) |
| Language | TypeScript |
| AI Model | Google Gemini 2.5 Flash (free tier) |
| Database | Supabase (PostgreSQL) |
| Messaging | Meta WhatsApp Cloud API v21.0 |
| Hosting | Vercel |
| Styling | Tailwind CSS |

---

## Project Structure

```
src/
  app/
    page.tsx                          # Home page (bot status)
    layout.tsx                        # Root layout
    test/page.tsx                     # Embroidery demo chat
    demo/food/page.tsx                # Food demo chat
    kitchen/menu/page.tsx             # Kitchen admin (PIN + toggles)
    api/
      webhooks/whatsapp/route.ts      # WhatsApp webhook (GET verify + POST messages)
      food-chat/route.ts              # Food demo API endpoint
      test-chat/route.ts              # Embroidery demo API endpoint
      kitchen/
        auth/route.ts                 # PIN auth (sets httpOnly cookie)
        menu/route.ts                 # Menu management (GET list + POST update)
  lib/
    ai/
      food-prompts.ts                 # System prompt builder (dynamic menu + IST time)
      food-tools.ts                   # Food tool declarations + executor
      food-conversation.ts            # Gemini integration for food bot
      prompts.ts                      # Embroidery system prompt
      tools.ts                        # Embroidery tools
      conversation.ts                 # Embroidery Gemini integration
    db/
      client.ts                       # Supabase singleton client
      queries.ts                      # Conversation + message queries
      food-queries.ts                 # Food menu, orders, config queries
    whatsapp/
      client.ts                       # Meta API client (send, verify, extract)
      types.ts                        # WhatsApp webhook types
```

---

## Environment Variables

```bash
# Meta WhatsApp Cloud API
META_WHATSAPP_TOKEN=               # Permanent access token
META_PHONE_NUMBER_ID=              # WhatsApp phone number ID
META_WEBHOOK_VERIFY_TOKEN=         # Webhook verification string
META_APP_SECRET=                   # HMAC signature verification

# Google Gemini AI
GEMINI_API_KEY=                    # From https://aistudio.google.com/apikey

# Supabase
NEXT_PUBLIC_SUPABASE_URL=          # Project URL
SUPABASE_SERVICE_ROLE_KEY=         # Service role key (server-side only)

# Bot Configuration
BOT_MODE=                          # "food" or "embroidery" (default: embroidery)
KITCHEN_PIN=                       # PIN for /kitchen/menu page

# Seller
SELLER_WHATSAPP_NUMBER=            # With country code (e.g. 919876543210)
SELLER_BUSINESS_NAME=
SELLER_LOCATION=
SELLER_WORKING_HOURS=
```

---

## Database Schema (Supabase)

### Shared Tables

**conversations**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| customer_phone | TEXT | WhatsApp number |
| customer_name | TEXT | From WhatsApp profile |
| status | TEXT | active / closed |
| last_message_at | TIMESTAMP | Auto-updated |
| created_at | TIMESTAMP | |

**messages**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| conversation_id | UUID (FK) | |
| direction | TEXT | inbound / outbound |
| content | TEXT | Message text |
| message_type | TEXT | text / image / interactive |
| meta_message_id | TEXT | WhatsApp message ID |
| created_at | TIMESTAMP | |

### Food-Specific Tables

**menu_items** (master catalog)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| item_key | TEXT (UNIQUE) | Slug, e.g. "sambar-rice" |
| name | TEXT | Display name |
| description | TEXT | Short description |
| price | NUMERIC | Price in rupees |
| meal_type | TEXT | breakfast / lunch / dinner |
| is_active | BOOLEAN | Soft delete flag |
| created_at | TIMESTAMP | |

**daily_menu** (daily availability)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| menu_item_id | UUID (FK) | References menu_items |
| date | DATE | IST date (YYYY-MM-DD) |
| available | BOOLEAN | Toggle state |
| **UNIQUE** | | (menu_item_id, date) |

**food_business_config** (single row)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| business_name | TEXT | |
| location | TEXT | |
| working_hours | TEXT | |
| delivery_areas | JSONB (text[]) | Array of area names |
| minimum_order | NUMERIC | Minimum Rs. amount |
| delivery_charge | NUMERIC | |
| delivery_note | TEXT | e.g. "Free within 5km" |
| payment_methods | JSONB (text[]) | e.g. ["Cash", "UPI"] |

**food_orders**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| conversation_id | UUID (FK) | Nullable |
| customer_phone | TEXT | |
| customer_name | TEXT | |
| items_json | JSONB | [{name, qty, price}] |
| items_text | TEXT | Readable summary |
| total | NUMERIC | |
| delivery_type | TEXT | delivery / pickup |
| delivery_address | TEXT | Nullable |
| meal_type | TEXT | breakfast / lunch / dinner |
| notes | TEXT | Special instructions |
| status | TEXT | confirmed / preparing / delivered / cancelled |
| created_at | TIMESTAMP | |

### Fallback Rule
If no `daily_menu` rows exist for today's date, `getTodaysMenu()` returns ALL active `menu_items`. This prevents empty menus when the owner forgets to set toggles.

---

## API Endpoints

### WhatsApp Webhook

**GET /api/webhooks/whatsapp**
- Purpose: Meta webhook verification during setup
- Params: `hub.mode`, `hub.verify_token`, `hub.challenge`
- Returns: `challenge` string if token matches `META_WEBHOOK_VERIFY_TOKEN`

**POST /api/webhooks/whatsapp**
- Purpose: Receive incoming WhatsApp messages
- Auth: HMAC-SHA256 signature verification via `x-hub-signature-256` header
- Flow: Extract messages -> BOT_MODE routing -> AI processing -> Reply
- Always returns 200 (Meta retries on non-200)

### Food Demo Chat

**POST /api/food-chat**
- Purpose: Browser-based food bot testing
- Body: `{ message: string, conversationId?: string }`
- Returns: `{ reply: string, conversationId: string }`

### Kitchen Auth

**POST /api/kitchen/auth**
- Purpose: Validate kitchen PIN
- Body: `{ pin: string }`
- Success: Sets `kitchen_auth` cookie (httpOnly, 24h, sameSite: lax)
- Failure: 401

### Kitchen Menu

**GET /api/kitchen/menu**
- Auth: `kitchen_auth` cookie
- Returns: `{ items: { breakfast: MenuItem[], lunch: MenuItem[], dinner: MenuItem[] } }`

**POST /api/kitchen/menu**
- Auth: `kitchen_auth` cookie
- Body: `{ items: [{ menu_item_id: string, available: boolean }] }`
- Action: Upserts `daily_menu` rows for today (IST)

---

## AI Tool Declarations

### get_todays_menu
```
Parameters:
  meal_type: string (optional) - "breakfast" | "lunch" | "dinner" | "all"

Returns: Menu items grouped by meal type with name, price, description
```

### search_menu
```
Parameters:
  query: string (required) - Search term (e.g. "biryani", "dosa")

Returns: Matching items or { found: false } message
```

### confirm_order
```
Parameters:
  items: string (required) - e.g. "2x Sambar Rice, 1x Curd Rice"
  total: number (required) - Total in rupees
  delivery_type: string (required) - "delivery" or "pickup"
  meal_type: string (required) - "breakfast" | "lunch" | "dinner"
  delivery_address: string (optional) - Required if delivery
  customer_name: string (optional)
  notes: string (optional) - Special instructions

Side effects:
  - Saves to food_orders table
  - Triggers notifySeller() with formatted order

Returns: { success, order_id, summary, message }
```

---

## IST Timezone Handling

All date/time operations use IST (Asia/Kolkata, UTC+5:30):

**Date calculation** (`food-queries.ts`):
```typescript
export function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
// Returns "2026-05-30" format
```

**Time display** (`food-prompts.ts`):
```typescript
function getISTTimeInfo() {
  const now = new Date();
  const istStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const ist = new Date(istStr);
  return {
    day: days[ist.getDay()],
    hour: ist.getHours(),
    minute: ist.getMinutes(),
    timeStr: ist.toLocaleTimeString("en-US", { ... }),
  };
}
```

Used in:
- `getTodaysMenu()` - daily_menu date matching
- `getDailyMenuStatus()` - kitchen page date
- `updateDailyMenu()` - upsert date
- `buildFoodSystemPrompt()` - current time in system prompt
- `formatMenuForPrompt()` - today's day name

---

## WhatsApp Client Functions

File: `src/lib/whatsapp/client.ts`

| Function | Purpose |
|----------|---------|
| `verifyWebhookSignature(body, signature)` | HMAC-SHA256 validation |
| `extractMessages(body)` | Parse Meta webhook payload |
| `getMessageText(message)` | Handle text/interactive/image/audio types |
| `sendMessage(message)` | HTTP POST to Meta Graph API v21.0 |
| `sendTextReply(to, text)` | Send plain text reply |
| `sendButtonMessage(to, text, buttons)` | Interactive buttons (max 3) |
| `notifySeller(orderSummary)` | Send order to SELLER_WHATSAPP_NUMBER |
| `markAsRead(messageId)` | Blue tick the message |

---

## Conversation Flow (Gemini Integration)

File: `src/lib/ai/food-conversation.ts`

1. Build system prompt dynamically (menu + business config + IST time)
2. Load last 10 messages as conversation history
3. Send to Gemini 2.5 Flash with tool declarations
4. Tool loop (max 5 rounds):
   - If Gemini returns a tool call -> execute it -> feed result back
   - If Gemini returns text -> return as reply
5. Retry logic: 3 attempts with backoff on 503/429 errors
6. Track `orderConfirmed` flag when `confirm_order` tool succeeds

Response type:
```typescript
interface FoodAIResponse {
  reply: string;           // Message to send customer
  orderConfirmed: boolean; // Did confirm_order succeed?
  orderSummary: string;    // Formatted order for seller notification
}
```

---

## Deployment Setup

### Prerequisites
- GitHub repository connected to Vercel
- Supabase project (Asia Pacific region recommended)
- Meta Developer account with WhatsApp Cloud API access

### Vercel Environment Variables
Add all variables from the Environment Variables section above in Vercel Dashboard -> Settings -> Environment Variables.

Critical ones for food bot:
```
BOT_MODE=food
KITCHEN_PIN=1234
```

### Supabase Setup
1. Create project at supabase.com
2. Go to SQL Editor
3. Run `supabase/migrations/001_init.sql` (conversations, messages, orders)
4. Run `supabase/migrations/002_food_menu.sql` (food tables + seed data)
5. Copy project URL and service role key to env vars

### Meta WhatsApp Setup
1. Create app at developers.facebook.com
2. Add WhatsApp product
3. Set webhook URL: `https://your-app.vercel.app/api/webhooks/whatsapp`
4. Set verify token to match `META_WEBHOOK_VERIFY_TOKEN`
5. Subscribe to `messages` webhook field
6. Get permanent access token and phone number ID

### Webhook Verification Test
```
GET https://your-app.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=my-secret-verify-token&hub.challenge=test123
```
Should return: `test123`

---

## Key Design Decisions

1. **Gemini 2.5 Flash** - Free tier (20 req/day, 15 req/min). Sufficient for MVP. Upgrade to paid tier for production.

2. **BOT_MODE env var** - Single codebase serves multiple business types. Switch by changing one env var.

3. **Daily menu toggle system** - Master items are permanent. Daily availability is a separate table. Owner never needs to re-enter item details.

4. **IST-only timezone** - All dates use `Asia/Kolkata`. Prevents UTC date mismatch between Supabase (UTC) and application logic.

5. **PIN auth with cookies** - Simple, no user accounts needed. httpOnly cookie, 24h session. Suitable for single-owner MVP.

6. **Fallback menu** - If no daily_menu rows exist for today, show all active items. Prevents empty menu on days owner forgets to toggle.

7. **Tool-based ordering** - Gemini calls structured tools (not free-text parsing). Ensures consistent order data format for DB storage.

8. **Always return 200** - WhatsApp webhook always returns 200 even on errors. Meta retries on non-200, causing duplicate messages.

---

## Troubleshooting

### Bot returns empty menu
- Check if `daily_menu` has rows for today's IST date
- Verify `menu_items` has `is_active = true` items
- Check Supabase connection (SUPABASE_SERVICE_ROLE_KEY)

### Webhook verification fails
- Verify `META_WEBHOOK_VERIFY_TOKEN` matches exactly in Meta dashboard and env vars
- Check the webhook URL ends with `/api/webhooks/whatsapp` (no trailing slash)

### Orders not saving to database
- Check Supabase service role key permissions
- Check `food_orders` table exists
- Look at Vercel function logs for errors

### Kitchen page shows "Wrong PIN"
- Verify `KITCHEN_PIN` env var is set in Vercel
- Redeploy after adding env vars

### Gemini rate limit (429)
- Free tier: 20 requests/day, 15 requests/minute
- Built-in retry handles temporary 429s
- For production: upgrade to paid Gemini API

### Date mismatch (menu shows wrong items)
- All dates use IST via `getTodayIST()`
- Supabase stores dates in UTC but queries use IST-calculated date string
- Verify server timezone doesn't affect `toLocaleDateString` (Vercel uses UTC, but the timezone parameter forces IST)
