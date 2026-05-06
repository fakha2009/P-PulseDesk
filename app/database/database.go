package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"habitracker/migrations"
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
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return fmt.Errorf("failed to ensure schema_migrations: %w", err)
	}

	all, err := migrations.All()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	for _, migration := range all {
		var exists bool
		if err := db.QueryRow("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)", migration.Version).Scan(&exists); err != nil {
			return fmt.Errorf("failed to check migration %s: %w", migration.Version, err)
		}
		if exists {
			continue
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("failed to start migration %s: %w", migration.Version, err)
		}
		if _, err := tx.Exec(migration.SQL); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %s_%s failed: %w", migration.Version, migration.Name, err)
		}
		if _, err := tx.Exec(
			"INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
			migration.Version,
			migration.Name,
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed to record migration %s: %w", migration.Version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %s: %w", migration.Version, err)
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
