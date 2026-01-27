-- ICS Calendar Events Table
-- Stores events fetched from external ICS calendar feeds

CREATE TABLE IF NOT EXISTS ics_calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE NOT NULL,              -- Unique ID from ICS feed
    summary TEXT NOT NULL,                  -- Event title
    description TEXT,                       -- Event description
    location TEXT,                          -- Event location
    start_date TEXT NOT NULL,               -- ISO datetime
    end_date TEXT NOT NULL,                 -- ISO datetime
    all_day INTEGER DEFAULT 0,              -- 1 if all-day event
    source_calendar TEXT NOT NULL,          -- Which ICS feed this came from
    relevant_to TEXT,                       -- JSON array of family member names
    relevance_reason TEXT,                  -- Why this event is/isn't relevant
    should_sync INTEGER DEFAULT 1,          -- 1 if should be synced to Google Calendar
    synced_to_google INTEGER DEFAULT 0,     -- 1 if already synced
    google_event_id TEXT,                   -- Google Calendar event ID if synced
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for querying upcoming events
CREATE INDEX IF NOT EXISTS idx_ics_events_start_date ON ics_calendar_events(start_date);

-- Index for filtering by relevance
CREATE INDEX IF NOT EXISTS idx_ics_events_should_sync ON ics_calendar_events(should_sync);

-- Index for source calendar
CREATE INDEX IF NOT EXISTS idx_ics_events_source ON ics_calendar_events(source_calendar);
