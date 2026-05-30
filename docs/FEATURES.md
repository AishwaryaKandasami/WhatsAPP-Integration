# WhatsApp AI Food Order Bot - Features & User Guide

## What Is This?

An AI-powered WhatsApp bot that takes food orders for your home kitchen business. Customers message your WhatsApp number, the bot shows today's menu, takes their order, confirms it instantly, and sends you a notification. You just cook and deliver.

---

## Features

### 1. Automated Order Taking
- Customers message your WhatsApp number
- Bot greets them and shows today's menu based on the time of day
- Handles the full order flow: items, quantities, delivery/pickup, address
- Calculates total automatically
- Confirms the order and notifies your kitchen instantly

### 2. Smart Menu Display (Time-Based)
The bot shows the right menu at the right time (IST):
| Time | Menu Shown |
|------|-----------|
| Before 10:00 AM | Breakfast |
| 10:00 AM - 2:00 PM | Lunch |
| After 5:00 PM | Dinner |

If a customer asks for a specific meal ("show me dinner menu"), the bot shows that regardless of time.

### 3. Meal-Specific Delivery Estimates
| Meal | Delivery Window |
|------|----------------|
| Breakfast | 7:30 AM - 9:30 AM |
| Lunch | 12:00 PM - 1:30 PM |
| Dinner | 7:30 PM - 9:00 PM |

All times are in IST (Indian Standard Time).

### 4. Bilingual Support (English + Tanglish)
- If the customer writes in English, bot replies in English
- If the customer writes in Tamil/Tanglish, bot replies in Tanglish (Tamil words in English letters)
- Example: "Vanakkam! Inniki lunch menu la sambar rice, lemon rice iruku. Enna order pannuvinga?"
- Never uses Tamil script - always readable Roman letters (A-Z)

### 5. Kitchen Menu Management (Daily Toggle)
You control what's available each day from your phone. No coding needed.

### 6. Order Notifications
When a customer confirms an order, you get a WhatsApp message with:
- Order ID
- Customer name and phone number
- Items ordered with quantities
- Total amount
- Delivery address or pickup
- Meal type
- Special notes (less spicy, extra sambar, etc.)

### 7. Smart Order Rules
The bot automatically enforces:
- Minimum order amount
- Delivery area restrictions (suggests pickup if outside area)
- Only shows items that are on today's menu
- Cannot change prices
- Redirects complaints to the kitchen owner

---

## How To Use the Kitchen Menu Page

This is your daily control panel. Open it on your phone each morning to set what's available today.

### Step 1: Open the Menu Page
Go to: `https://your-app-url.vercel.app/kitchen/menu`

### Step 2: Enter Your PIN
- You'll see a login screen asking for your PIN
- Enter your kitchen PIN (default: `1234`)
- Tap "Login"
- The PIN session lasts 24 hours, so you won't need to re-enter it every time

### Step 3: Toggle Items ON/OFF
- You'll see three sections: **Breakfast**, **Lunch**, and **Dinner**
- Each item shows its name and price
- **Orange toggle = Available** (customers can order this)
- **Gray toggle = Unavailable** (hidden from customers)
- Tap any toggle to switch it

### Step 4: Save Changes
- Tap the **"Save Changes"** button at the bottom
- You'll see "Menu updated!" confirmation
- Changes take effect immediately - the bot will only show available items

### Tips
- Update the menu every morning before breakfast orders start
- If you forget to update, the bot shows ALL items as available (safety fallback)
- Each day starts fresh - yesterday's toggles don't carry over
- You can update the menu multiple times during the day (e.g., ran out of biryani at lunch)

---

## Sample Customer Conversation

Here's what a typical order looks like:

**Customer:** hi, lunch menu enna iruku?

**Bot:** Vanakkam! Today's lunch menu:
- Sambar Rice - Rs.60
- Curd Rice - Rs.50
- Lemon Rice - Rs.50
- Veg Biryani - Rs.90
- Chicken Biryani - Rs.120
- Chapati Meals - Rs.80

Enna order pannuvinga?

**Customer:** 2 sambar rice, 1 chicken biryani. delivery to T Nagar

**Bot:** Order summary:
- 2x Sambar Rice = Rs.120
- 1x Chicken Biryani = Rs.120
- Total: Rs.240
- Delivery to T Nagar

Confirm pannalama?

**Customer:** yes

**Bot:** Order confirmed! 2x Sambar Rice + 1x Chicken Biryani. Total: Rs.240. Delivery to T Nagar by 12:30 PM. Payment on delivery. Nandri!

**You receive:** "CONFIRMED ORDER - Order ID: FOOD-ABC123 - Customer: Priya - Items: 2x Sambar Rice, 1x Chicken Biryani - Rs.240 - Deliver to T Nagar"

---

## What the Bot Handles vs What You Handle

| Bot Does | You Do |
|----------|--------|
| Shows today's menu | Update menu each morning (30 seconds) |
| Takes orders (items, qty, address) | Cook the food |
| Calculates total | Deliver the order |
| Confirms orders instantly | Collect payment on delivery |
| Answers FAQs (timings, areas, min order) | Handle complaints (bot redirects to you) |
| Works 24/7, handles 100+ customers at once | |
| Sends you order notifications | |

---

## Business Rules (Configured for You)

These are set up once and the bot follows them:

| Setting | What It Controls |
|---------|-----------------|
| Business Name | How the bot introduces itself |
| Location | Shown to customers |
| Working Hours | Displayed in responses |
| Delivery Areas | Bot only accepts delivery to these areas |
| Minimum Order | Bot rejects orders below this amount |
| Payment Methods | Shown to customers (e.g., Cash, UPI) |
| Delivery Note | e.g., "Free delivery within 5km" |

To change any of these, contact the admin (database update needed).

---

## Testing Without WhatsApp

Use the demo page to test the bot in your browser:
`https://your-app-url.vercel.app/demo/food`

This works exactly like the WhatsApp bot but in a web chat interface. Use it to:
- Verify today's menu is showing correctly
- Test ordering flow
- Check that toggled-off items are hidden
- Train yourself on how the bot responds

---

## Frequently Asked Questions

**Q: What if I forget to update the menu?**
A: The bot shows ALL your items as available. No customer sees an empty menu.

**Q: Can I change prices?**
A: Prices are set in the master menu. Contact admin to update them.

**Q: What if a customer orders outside delivery area?**
A: The bot suggests pickup instead.

**Q: What if the customer has a complaint?**
A: The bot says "Sorry about that, let me connect you with the kitchen" and stops responding. You handle it from there.

**Q: How many customers can the bot handle?**
A: Unlimited simultaneous conversations. No waiting, no missed orders.

**Q: What languages does it support?**
A: English and Tanglish (Tamil in English letters). Never uses Tamil script.

**Q: Does the bot accept payment?**
A: No. It tells the customer "Payment on delivery." You collect cash/UPI yourself.
