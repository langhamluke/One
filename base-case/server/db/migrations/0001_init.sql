-- Base Case initial schema. Idempotent: safe to apply more than once.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text,
  role text NOT NULL CHECK (role IN ('admin','advisor','client')),
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  totp_secret_enc text,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_last_counter bigint,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  mfa_verified boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by uuid,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invites_user_idx ON invites (user_id);

CREATE TABLE IF NOT EXISTS advisor_clients (
  advisor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (advisor_id, client_id)
);
CREATE INDEX IF NOT EXISTS advisor_clients_client_idx ON advisor_clients (client_id);

CREATE TABLE IF NOT EXISTS plans (
  client_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  state_enc text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS plan_versions (
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  state_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  reason text NOT NULL DEFAULT '',
  PRIMARY KEY (client_id, version)
);

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  title text NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','withdrawn')),
  state_enc text NOT NULL,
  base_version integer NOT NULL DEFAULT 0,
  review_note text,
  reviewer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS proposals_client_idx ON proposals (client_id);
CREATE INDEX IF NOT EXISTS proposals_status_idx ON proposals (status);

CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_threads_client_idx ON chat_threads (client_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content_enc text NOT NULL,
  mode text NOT NULL DEFAULT 'offline' CHECK (mode IN ('claude','offline')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages (thread_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  ip text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id);
-- Append-only: updates and deletes are silently ignored at the database level.
CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
