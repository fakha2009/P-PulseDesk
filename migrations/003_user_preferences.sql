CREATE TABLE IF NOT EXISTS user_preferences (
	user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
	accent TEXT NOT NULL DEFAULT 'purple-blue' CHECK (accent IN ('purple-blue','blue','emerald','rose','amber')),
	density TEXT NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable','compact')),
	motion TEXT NOT NULL DEFAULT 'normal' CHECK (motion IN ('normal','reduced')),
	background_glow BOOLEAN NOT NULL DEFAULT TRUE,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
