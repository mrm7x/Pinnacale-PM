-- ============================================================================
-- DROP OFFICE 365 INTEGRATION COLUMNS
-- ----------------------------------------------------------------------------
-- The O365 / Microsoft Graph integration (MSAL sign-in, To-Do task sync,
-- Outlook calendar events) has been removed from the application. These two
-- columns held the external IDs returned by Graph and were only ever written
-- by the sync feature. With the feature gone they are unused and are dropped.
-- ============================================================================

ALTER TABLE tasks DROP COLUMN IF EXISTS o365_task_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS o365_calendar_event_id;
