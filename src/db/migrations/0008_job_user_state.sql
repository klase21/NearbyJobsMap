CREATE TABLE job_user_state (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  workflow_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (workflow_status IN ('unreviewed','interested','apply_planned','applied','waiting','interview','rejected','offer','hired','ignored')),
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0,1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 5000),
  application_date TEXT,
  follow_up_at TEXT,
  personal_deadline TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_job_user_state_workflow ON job_user_state(workflow_status);
CREATE INDEX idx_job_user_state_favorite ON job_user_state(is_favorite);
