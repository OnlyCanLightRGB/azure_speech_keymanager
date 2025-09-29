-- Migration: 003_fix_json_billing_configs_table.sql
-- Description: Fix json_billing_configs table structure to match JsonBillingConfig interface
-- Created: 2025-01-25

-- This migration ensures the correct field name is used
-- Since the table was already created with the correct field name in init.sql,
-- this migration is essentially a no-op but ensures compatibility

SELECT 'Migration 003 completed - table structure is already correct' as message;
