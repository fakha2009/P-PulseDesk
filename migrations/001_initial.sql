CREATE TABLE IF NOT EXISTS users (
	id BIGSERIAL PRIMARY KEY,
	name VARCHAR(120) NOT NULL,
	email VARCHAR(190) NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
	theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('light','dark')),
	disabled BOOLEAN NOT NULL DEFAULT FALSE,
	onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'users_theme_check'
	) THEN
		ALTER TABLE users ADD CONSTRAINT users_theme_check CHECK (theme IN ('light','dark'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS tasks (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title VARCHAR(255) NOT NULL,
	description TEXT,
	priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
	due_date TIMESTAMPTZ NULL,
	recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
	sort_order INT NOT NULL DEFAULT 0,
	completed BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'tasks_recurrence_check'
	) THEN
		ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_check CHECK (recurrence IN ('none','daily','weekly','monthly'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_subtasks (
	id BIGSERIAL PRIMARY KEY,
	task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
	title VARCHAR(255) NOT NULL,
	completed BOOLEAN NOT NULL DEFAULT FALSE,
	sort_order INT NOT NULL DEFAULT 0,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habits (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title VARCHAR(255) NOT NULL,
	description TEXT,
	color VARCHAR(32),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habit_checks (
	id BIGSERIAL PRIMARY KEY,
	habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	check_date DATE NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (habit_id, check_date)
);

CREATE TABLE IF NOT EXISTS sleep_settings (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	target_bed_time TIME NOT NULL,
	target_wake_time TIME NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sleep_logs (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	sleep_date DATE NOT NULL,
	bed_time TIMESTAMPTZ NOT NULL,
	wake_time TIMESTAMPTZ NOT NULL,
	duration_minutes INT NOT NULL,
	quality TEXT NOT NULL CHECK (quality IN ('poor','normal','great')),
	note TEXT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id, sleep_date)
);
