ALTER TABLE habits ADD COLUMN IF NOT EXISTS proof_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS proof_prompt TEXT NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'habits_proof_type_check'
	) THEN
		ALTER TABLE habits ADD CONSTRAINT habits_proof_type_check CHECK (proof_type IN ('none','note','photo','audio','photo_or_audio'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS habit_proofs (
	id BIGSERIAL PRIMARY KEY,
	habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
	user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	completion_date DATE NOT NULL,
	type TEXT NOT NULL CHECK (type IN ('note','photo','audio')),
	text_note TEXT NULL,
	file_url TEXT NULL,
	file_name TEXT NULL,
	mime_type TEXT NULL,
	file_size BIGINT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (habit_id, completion_date)
);
