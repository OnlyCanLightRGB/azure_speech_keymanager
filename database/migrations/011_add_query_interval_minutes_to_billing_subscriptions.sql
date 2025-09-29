-- Migration: 011_add_query_interval_minutes_to_billing_subscriptions.sql
-- Description: Add query_interval_minutes field to billing_subscriptions table for minute-level scheduling
-- Created: 2025-09-29

-- Add query_interval_minutes field to billing_subscriptions table
-- This allows for more granular scheduling (e.g., every 1 minute instead of just hourly)
-- Note: Using simple ALTER TABLE statements, migration manager will handle duplicate column errors

-- Add query_interval_minutes column
ALTER TABLE billing_subscriptions
ADD COLUMN query_interval_minutes INT NOT NULL DEFAULT 1440 COMMENT 'Query interval in minutes (default 1440 = 24 hours)';

-- Add index for better query performance
CREATE INDEX idx_billing_subscriptions_query_interval_minutes
ON billing_subscriptions (query_interval_minutes);
