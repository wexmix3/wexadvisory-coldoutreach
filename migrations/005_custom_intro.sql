-- Migration 005: Add AI-generated custom intro line to prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS custom_intro TEXT;
