-- ============================================================
-- Food Business Config (single row per business)
-- ============================================================
CREATE TABLE IF NOT EXISTS food_business_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  location TEXT NOT NULL,
  working_hours TEXT NOT NULL,
  delivery_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  minimum_order NUMERIC NOT NULL DEFAULT 100,
  delivery_charge NUMERIC NOT NULL DEFAULT 0,
  delivery_note TEXT,
  payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Menu Items (master list — never deleted, toggled via is_active)
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_meal_type ON menu_items(meal_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(is_active);

-- ============================================================
-- Daily Menu (which items are available on a given date)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_menu (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  available BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(menu_item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_menu_date ON daily_menu(date);

-- ============================================================
-- Food Orders (separate from embroidery orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS food_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  items_json JSONB NOT NULL,
  items_text TEXT NOT NULL,
  total NUMERIC NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('delivery', 'pickup')),
  delivery_address TEXT,
  meal_type TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_orders_status ON food_orders(status);
CREATE INDEX IF NOT EXISTS idx_food_orders_date ON food_orders(created_at);

-- ============================================================
-- SEED DATA: Business Config
-- ============================================================
INSERT INTO food_business_config (business_name, location, working_hours, delivery_areas, minimum_order, delivery_charge, delivery_note, payment_methods)
VALUES (
  'Amma''s Kitchen',
  'Adyar, Chennai',
  'Breakfast: 7-10 AM, Lunch: 11:30 AM - 2 PM, Dinner: 7-9:30 PM',
  '["Adyar", "Besant Nagar", "Thiruvanmiyur", "Kotturpuram", "Raja Annamalai Puram", "Mylapore", "Mandaveli"]'::jsonb,
  100,
  0,
  'Free delivery for orders above Rs.100 within 5km. No delivery charge.',
  '["Cash on delivery", "Google Pay", "PhonePe"]'::jsonb
);

-- ============================================================
-- SEED DATA: Menu Items (14 items)
-- ============================================================
-- Breakfast
INSERT INTO menu_items (item_key, name, description, price, meal_type) VALUES
  ('idli-set', 'Idli Set (4 pcs)', 'Soft idlis with sambar and coconut chutney', 40, 'breakfast'),
  ('dosa-set', 'Dosa Set (2 pcs)', 'Crispy dosa with sambar and chutney', 50, 'breakfast'),
  ('pongal-vada', 'Pongal + Vada', 'Hot pongal with crispy vada and chutney', 60, 'breakfast'),
  ('upma-kesari', 'Upma + Kesari', 'Rava upma with sweet kesari', 45, 'breakfast');

-- Lunch
INSERT INTO menu_items (item_key, name, description, price, meal_type) VALUES
  ('sambar-rice', 'Sambar Rice', 'Homemade sambar rice with appalam', 60, 'lunch'),
  ('lemon-rice', 'Lemon Rice', 'Tangy lemon rice with peanuts', 50, 'lunch'),
  ('curd-rice', 'Curd Rice', 'Cool curd rice with pickle', 40, 'lunch'),
  ('chicken-biryani', 'Chicken Biryani', 'Chennai-style chicken biryani with raita', 120, 'lunch'),
  ('veg-meals', 'Veg Meals (Full)', 'Rice + sambar + rasam + poriyal + curd + appalam + pickle', 80, 'lunch'),
  ('chapati-kurma', 'Chapati + Kurma (3 pcs)', 'Soft chapati with veg kurma', 70, 'lunch');

-- Dinner
INSERT INTO menu_items (item_key, name, description, price, meal_type) VALUES
  ('parotta-salna', 'Parotta + Salna (2 pcs)', 'Flaky parotta with spicy salna', 70, 'dinner'),
  ('idiyappam-kurma', 'Idiyappam + Kurma (4 pcs)', 'Soft idiyappam with veg kurma', 60, 'dinner'),
  ('chapati-kurma-dinner', 'Chapati + Kurma (3 pcs)', 'Soft chapati with veg kurma', 70, 'dinner'),
  ('chicken-biryani-dinner', 'Chicken Biryani', 'Chennai-style chicken biryani with raita', 120, 'dinner');

-- ============================================================
-- SEED DATA: Daily Menu (all items available today)
-- ============================================================
INSERT INTO daily_menu (menu_item_id, date, available)
SELECT id, CURRENT_DATE, true FROM menu_items;
