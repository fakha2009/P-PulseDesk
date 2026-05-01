package repository

import (
	"database/sql"
	"errors"
	"time"

	"habitracker/app/models"
)

type SleepRepository struct {
	db *sql.DB
}

func NewSleepRepository(db *sql.DB) *SleepRepository {
	return &SleepRepository{db: db}
}

func (r *SleepRepository) GetSettings(userID int64) (*models.SleepSettings, error) {
	var settings models.SleepSettings
	err := r.db.QueryRow(
		`SELECT id, user_id, target_bed_time::text, target_wake_time::text, created_at, updated_at
		 FROM sleep_settings
		 WHERE user_id = $1`,
		userID,
	).Scan(&settings.ID, &settings.UserID, &settings.TargetBedTime, &settings.TargetWakeTime, &settings.CreatedAt, &settings.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

func (r *SleepRepository) UpsertSettings(userID int64, targetBedTime, targetWakeTime string) (*models.SleepSettings, error) {
	_, err := r.db.Exec(
		`INSERT INTO sleep_settings (user_id, target_bed_time, target_wake_time, created_at, updated_at)
		 VALUES ($1, $2, $3, NOW(), NOW())
		 ON CONFLICT (user_id) DO UPDATE SET
			target_bed_time = EXCLUDED.target_bed_time,
			target_wake_time = EXCLUDED.target_wake_time,
			updated_at = NOW()`,
		userID, targetBedTime, targetWakeTime,
	)
	if err != nil {
		return nil, err
	}
	return r.GetSettings(userID)
}

func (r *SleepRepository) GetLogs(userID int64) ([]models.SleepLog, error) {
	rows, err := r.db.Query(
		`SELECT id, user_id, sleep_date, bed_time, wake_time, duration_minutes, quality, note, created_at, updated_at
		 FROM sleep_logs
		 WHERE user_id = $1
		 ORDER BY sleep_date DESC, id DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSleepLogs(rows)
}

func (r *SleepRepository) GetWeeklyLogs(userID int64, today time.Time) ([]models.SleepLog, error) {
	start := today.AddDate(0, 0, -6).Format("2006-01-02")
	end := today.Format("2006-01-02")
	rows, err := r.db.Query(
		`SELECT id, user_id, sleep_date, bed_time, wake_time, duration_minutes, quality, note, created_at, updated_at
		 FROM sleep_logs
		 WHERE user_id = $1 AND sleep_date BETWEEN $2 AND $3
		 ORDER BY sleep_date DESC`,
		userID, start, end,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanSleepLogs(rows)
}

func (r *SleepRepository) GetTodayLog(userID int64, today time.Time) (*models.SleepLog, error) {
	return r.GetByDate(userID, today.Format("2006-01-02"))
}

func (r *SleepRepository) GetByDate(userID int64, sleepDate string) (*models.SleepLog, error) {
	var log models.SleepLog
	err := scanSleepLog(r.db.QueryRow(
		`SELECT id, user_id, sleep_date, bed_time, wake_time, duration_minutes, quality, note, created_at, updated_at
		 FROM sleep_logs
		 WHERE user_id = $1 AND sleep_date = $2`,
		userID, sleepDate,
	), &log)
	if err != nil {
		return nil, err
	}
	return &log, nil
}

func (r *SleepRepository) GetByID(userID, id int64) (*models.SleepLog, error) {
	var log models.SleepLog
	err := scanSleepLog(r.db.QueryRow(
		`SELECT id, user_id, sleep_date, bed_time, wake_time, duration_minutes, quality, note, created_at, updated_at
		 FROM sleep_logs
		 WHERE id = $1 AND user_id = $2`,
		id, userID,
	), &log)
	if err != nil {
		return nil, err
	}
	return &log, nil
}

func (r *SleepRepository) UpsertLog(log models.SleepLog) (*models.SleepLog, error) {
	_, err := r.db.Exec(
		`INSERT INTO sleep_logs (user_id, sleep_date, bed_time, wake_time, duration_minutes, quality, note, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NOW(), NOW())
		 ON CONFLICT (user_id, sleep_date) DO UPDATE SET
			bed_time = EXCLUDED.bed_time,
			wake_time = EXCLUDED.wake_time,
			duration_minutes = EXCLUDED.duration_minutes,
			quality = EXCLUDED.quality,
			note = EXCLUDED.note,
			updated_at = NOW()`,
		log.UserID, log.SleepDate, log.BedTime, log.WakeTime, log.DurationMinutes, log.Quality, log.Note,
	)
	if err != nil {
		return nil, err
	}
	return r.GetByDate(log.UserID, log.SleepDate)
}

func (r *SleepRepository) UpdateLog(log models.SleepLog) (*models.SleepLog, error) {
	result, err := r.db.Exec(
		`UPDATE sleep_logs
		 SET sleep_date = $1, bed_time = $2, wake_time = $3, duration_minutes = $4, quality = $5, note = NULLIF($6, ''), updated_at = NOW()
		 WHERE id = $7 AND user_id = $8`,
		log.SleepDate, log.BedTime, log.WakeTime, log.DurationMinutes, log.Quality, log.Note, log.ID, log.UserID,
	)
	if err != nil {
		return nil, err
	}

	if rows, err := result.RowsAffected(); err == nil && rows == 0 {
		return nil, sql.ErrNoRows
	}

	return r.GetByID(log.UserID, log.ID)
}

func (r *SleepRepository) DeleteLog(userID, id int64) error {
	result, err := r.db.Exec("DELETE FROM sleep_logs WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		return err
	}

	if rows, err := result.RowsAffected(); err == nil && rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanSleepLog(row scanner, log *models.SleepLog) error {
	var sleepDate time.Time
	var note sql.NullString
	if err := row.Scan(
		&log.ID,
		&log.UserID,
		&sleepDate,
		&log.BedTime,
		&log.WakeTime,
		&log.DurationMinutes,
		&log.Quality,
		&note,
		&log.CreatedAt,
		&log.UpdatedAt,
	); err != nil {
		return err
	}

	log.SleepDate = sleepDate.Format("2006-01-02")
	if note.Valid {
		log.Note = note.String
	}
	return nil
}

func scanSleepLogs(rows *sql.Rows) ([]models.SleepLog, error) {
	logs := make([]models.SleepLog, 0)
	for rows.Next() {
		var log models.SleepLog
		if err := scanSleepLog(rows, &log); err != nil {
			return nil, err
		}
		logs = append(logs, log)
	}
	if err := rows.Err(); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	return logs, nil
}
