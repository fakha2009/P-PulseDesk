package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type DB struct {
	*sql.DB
}

func New(databaseURL string) (*DB, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{db}, nil
}

func (db *DB) Migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
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
		)`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark'`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT TRUE`,
		`DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'users_theme_check'
			) THEN
				ALTER TABLE users ADD CONSTRAINT users_theme_check CHECK (theme IN ('light','dark'));
			END IF;
		END $$`,
		`CREATE TABLE IF NOT EXISTS user_preferences (
			user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light','system')),
			accent TEXT NOT NULL DEFAULT 'purple-blue' CHECK (accent IN ('purple-blue','blue','emerald','rose','amber')),
			density TEXT NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable','compact')),
			motion TEXT NOT NULL DEFAULT 'normal' CHECK (motion IN ('normal','reduced')),
			background_glow BOOLEAN NOT NULL DEFAULT TRUE,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS user_sessions (
			id BIGSERIAL PRIMARY KEY,
			user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			device_type TEXT NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('mobile','desktop')),
			browser TEXT NOT NULL DEFAULT 'Unknown',
			os TEXT NOT NULL DEFAULT 'Unknown',
			ip TEXT,
			user_agent TEXT,
			last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS tasks (
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
		)`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'`,
		`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0`,
		`DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'tasks_recurrence_check'
			) THEN
				ALTER TABLE tasks ADD CONSTRAINT tasks_recurrence_check CHECK (recurrence IN ('none','daily','weekly','monthly'));
			END IF;
		END $$`,
		`CREATE TABLE IF NOT EXISTS task_subtasks (
			id BIGSERIAL PRIMARY KEY,
			task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
			title VARCHAR(255) NOT NULL,
			completed BOOLEAN NOT NULL DEFAULT FALSE,
			sort_order INT NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS habits (
			id BIGSERIAL PRIMARY KEY,
			user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			color VARCHAR(32),
			proof_type TEXT NOT NULL DEFAULT 'none',
			proof_prompt TEXT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`ALTER TABLE habits ADD COLUMN IF NOT EXISTS proof_type TEXT NOT NULL DEFAULT 'none'`,
		`ALTER TABLE habits ADD COLUMN IF NOT EXISTS proof_prompt TEXT NULL`,
		`DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM pg_constraint WHERE conname = 'habits_proof_type_check'
			) THEN
				ALTER TABLE habits ADD CONSTRAINT habits_proof_type_check CHECK (proof_type IN ('none','note','photo','audio','photo_or_audio'));
			END IF;
		END $$`,
		`CREATE TABLE IF NOT EXISTS habit_checks (
			id BIGSERIAL PRIMARY KEY,
			habit_id BIGINT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
			user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			check_date DATE NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (habit_id, check_date)
		)`,
		`CREATE TABLE IF NOT EXISTS habit_proofs (
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
		)`,
		`CREATE TABLE IF NOT EXISTS sleep_settings (
			id BIGSERIAL PRIMARY KEY,
			user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			target_bed_time TIME NOT NULL,
			target_wake_time TIME NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS sleep_logs (
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
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)`,
		`CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(user_id, sort_order)`,
		`CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks(task_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active_at ON user_sessions(last_active_at)`,
		`CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habit_checks_habit_id ON habit_checks(habit_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habit_checks_user_id ON habit_checks(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habit_proofs_habit_id ON habit_proofs(habit_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habit_proofs_user_id ON habit_proofs(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_habit_proofs_completion_date ON habit_proofs(completion_date)`,
		`CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_id ON sleep_logs(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_sleep_logs_sleep_date ON sleep_logs(sleep_date)`,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	return nil
}

func (db *DB) Seed() error {
	adminPasswordHash := "$2a$10$TWI5scxwvHWLp0KDjYBGKeYqi184MJ4rRwzUrB1h68aFeg7P17dbe"
	var adminUserID int64
	err := db.QueryRow(
		`INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
		 VALUES ($1, $2, $3, 'admin', NOW(), NOW())
		 ON CONFLICT (email) DO UPDATE
		 SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = 'admin', updated_at = NOW()
		 RETURNING id`,
		"PulseDesk Admin", "admin@pulsedesk.local", adminPasswordHash,
	).Scan(&adminUserID)
	if err != nil {
		return err
	}
	log.Printf("Seed ensured admin user ID: %d", adminUserID)

	demoPasswordHash := "$2a$10$wb6mOhjqnkpqEEhpiN3yPelHdyAaItkWPNkpzaspakJXTIhBc7b1e"
	var demoUserID int64
	err = db.QueryRow(
		`INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
		 VALUES ($1, $2, $3, 'user', NOW(), NOW())
		 ON CONFLICT (email) DO UPDATE
		 SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = 'user', updated_at = NOW()
		 RETURNING id`,
		"Demo User", "demo@example.com", demoPasswordHash,
	).Scan(&demoUserID)
	if err != nil {
		return err
	}
	log.Printf("Seed ensured demo user ID: %d", demoUserID)

	now := time.Now()
	today := now.Format("2006-01-02")
	tomorrow := now.Add(24 * time.Hour).Format("2006-01-02")
	yesterday := now.Add(-24 * time.Hour).Format("2006-01-02")

	var taskCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM tasks WHERE user_id = $1", demoUserID).Scan(&taskCount); err != nil {
		return err
	}

	if taskCount == 0 {
		seedTasks := []struct {
			title       string
			description string
			priority    string
			dueDate     *string
			completed   bool
		}{
			{"Learn Go", "Finish the backend tutorial and practice the core API flow", "high", &today, false},
			{"Write code", "Implement API changes and verify user scenarios", "high", &today, false},
			{"Review changes", "Check the app before deployment", "medium", &tomorrow, false},
			{"Read documentation", "Review Gin router and middleware behavior", "low", nil, false},
			{"Finish project", "Prepare the application for demo", "medium", &tomorrow, false},
			{"Send report", "Weekly progress report", "high", &yesterday, false},
			{"Call client", "Discuss the next delivery stage", "medium", &today, true},
			{"Buy groceries", "Milk, bread, eggs", "low", nil, true},
		}

		for _, t := range seedTasks {
			_, err := db.Exec(
				`INSERT INTO tasks (user_id, title, description, priority, due_date, completed, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
				demoUserID, t.title, t.description, t.priority, t.dueDate, t.completed,
			)
			if err != nil {
				return err
			}
		}
	}

	var habitCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM habits WHERE user_id = $1", demoUserID).Scan(&habitCount); err != nil {
		return err
	}

	if habitCount == 0 {
		seedHabits := []struct {
			title       string
			description string
			color       string
		}{
			{"Morning workout", "15 minutes every day", "#22c55e"},
			{"Read books", "30 minutes of reading", "#3b82f6"},
			{"Meditation", "10 minutes of quiet practice", "#8b5cf6"},
			{"Drink water", "2 liters per day", "#06b6d4"},
			{"Sleep before 23:00", "Early sleep without screens", "#f59e0b"},
		}

		for _, h := range seedHabits {
			var habitID int64
			err := db.QueryRow(
				`INSERT INTO habits (user_id, title, description, color, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, NOW(), NOW())
				 RETURNING id`,
				demoUserID, h.title, h.description, h.color,
			).Scan(&habitID)
			if err != nil {
				return err
			}

			for i := 0; i < 5; i++ {
				if i != 0 && i != 2 && i != 4 {
					continue
				}
				checkDate := now.AddDate(0, 0, -i).Format("2006-01-02")
				_, err := db.Exec(
					`INSERT INTO habit_checks (habit_id, user_id, check_date, created_at)
					 VALUES ($1, $2, $3, NOW())
					 ON CONFLICT (habit_id, check_date) DO NOTHING`,
					habitID, demoUserID, checkDate,
				)
				if err != nil {
					return err
				}
			}
		}
	}

	if _, err := db.Exec(
		`INSERT INTO sleep_settings (user_id, target_bed_time, target_wake_time, created_at, updated_at)
		 VALUES ($1, '23:00:00', '07:00:00', NOW(), NOW())
		 ON CONFLICT (user_id) DO NOTHING`,
		demoUserID,
	); err != nil {
		return err
	}

	var sleepCount int
	if _, err := db.Exec("DELETE FROM sleep_logs WHERE user_id = $1 AND duration_minutes > $2", demoUserID, 24*60); err != nil {
		return err
	}
	if err := db.QueryRow("SELECT COUNT(*) FROM sleep_logs WHERE user_id = $1", demoUserID).Scan(&sleepCount); err != nil {
		return err
	}

	if sleepCount == 0 {
		seedSleepLogs := []struct {
			offset int
			bed    string
			wake   string
			note   string
		}{
			{0, "23:10:00", "07:05:00", "Good wake-up"},
			{-1, "22:55:00", "06:50:00", "Kept the schedule"},
			{-2, "00:20:00", "06:15:00", "Late night"},
			{-3, "23:30:00", "07:40:00", "Normal night"},
			{-4, "22:45:00", "07:20:00", "Deep sleep"},
			{-5, "01:05:00", "06:30:00", "Not enough sleep"},
			{-6, "23:00:00", "07:10:00", "Stable day"},
		}

		for _, entry := range seedSleepLogs {
			sleepDate := now.AddDate(0, 0, entry.offset)
			bedDay := sleepDate
			bedHour, err := strconv.Atoi(entry.bed[:2])
			if err != nil {
				return err
			}
			if bedHour >= 12 {
				bedDay = sleepDate.AddDate(0, 0, -1)
			}

			bedAt, err := time.ParseInLocation("2006-01-02 15:04:05", bedDay.Format("2006-01-02")+" "+entry.bed, time.Local)
			if err != nil {
				return err
			}
			wakeAt, err := time.ParseInLocation("2006-01-02 15:04:05", sleepDate.Format("2006-01-02")+" "+entry.wake, time.Local)
			if err != nil {
				return err
			}
			if wakeAt.Before(bedAt) {
				wakeAt = wakeAt.Add(24 * time.Hour)
			}

			duration := int(wakeAt.Sub(bedAt).Minutes())
			quality := "normal"
			if duration < 6*60 {
				quality = "poor"
			} else if duration >= 8*60 && duration <= 9*60 {
				quality = "great"
			}

			_, err = db.Exec(
				`INSERT INTO sleep_logs (user_id, sleep_date, bed_time, wake_time, duration_minutes, quality, note, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NOW(), NOW())
				 ON CONFLICT (user_id, sleep_date) DO NOTHING`,
				demoUserID, sleepDate.Format("2006-01-02"), bedAt, wakeAt, duration, quality, entry.note,
			)
			if err != nil {
				return err
			}
		}
	}

	return nil
}

func (db *DB) Close() error {
	return db.DB.Close()
}
