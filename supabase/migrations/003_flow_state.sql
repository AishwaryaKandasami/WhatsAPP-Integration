-- Migration 003: Add flow state tracking to conversations
-- Supports the state-machine / flow-based conversation architecture

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flow_state TEXT DEFAULT 'start';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS flow_data JSONB DEFAULT '{}';

-- Index for faster lookups by phone + status (used by getOrCreateConversation)
CREATE INDEX IF NOT EXISTS idx_conversations_phone_status
  ON conversations(customer_phone, status);
