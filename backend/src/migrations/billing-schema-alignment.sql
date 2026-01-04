-- Billing Schema Alignment Migration
-- Aligns CheckList schema with jbr-jazz generic column names
-- max_lists -> max_items, session_retention_days -> retention_days, list_count -> item_count

-- Rename subscription_tier columns
ALTER TABLE subscription_tier RENAME COLUMN max_lists TO max_items;
ALTER TABLE subscription_tier RENAME COLUMN session_retention_days TO retention_days;

-- Rename usage_snapshot column
ALTER TABLE usage_snapshot RENAME COLUMN list_count TO item_count;
