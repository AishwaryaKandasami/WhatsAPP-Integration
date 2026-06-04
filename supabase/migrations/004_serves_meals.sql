-- ============================================================
-- 004_serves_meals.sql
-- Per-client "meals we serve" master switches.
--
-- Some kitchens only do dinner (or skip lunch). These flags let the owner
-- turn an entire meal on/off from the kitchen page, independent of the daily
-- item toggles. The bot only offers a meal when it is BOTH switched on here
-- AND has available items today.
--
-- Default true so existing clients keep showing all three meals.
-- ============================================================

ALTER TABLE food_business_config
  ADD COLUMN IF NOT EXISTS serves_breakfast BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS serves_lunch     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS serves_dinner    BOOLEAN NOT NULL DEFAULT true;
