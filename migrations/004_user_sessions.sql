CREATE TABLE IF NOT EXISTS user_sessions (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	device_type TEXT NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('mobile','desktop')),
	browser TEXT NOT NULL DEFAULT 'Unknown',
	os TEXT NOT NULL DEFAULT 'Unknown',
	ip TEXT,
	user_agent TEXT,
	last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
