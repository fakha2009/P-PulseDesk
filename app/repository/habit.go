package repository

import (
	"database/sql"
	"time"

	"habitracker/app/models"
)

type HabitRepository struct {
	db *sql.DB
}

func NewHabitRepository(db *sql.DB) *HabitRepository {
	return &HabitRepository{db: db}
}

func (r *HabitRepository) GetAll(userID int64) ([]models.Habit, error) {
	query := `
		SELECT h.id, h.user_id, h.title, h.description, h.color, h.created_at, h.updated_at,
			0 as weekly_checks,
			0 as monthly_checks
		FROM habits h
		WHERE h.user_id = $1
		ORDER BY h.created_at DESC
	`

	rows, err := r.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var habits []models.Habit
	now := time.Now()
	today := now.Format("2006-01-02")

	for rows.Next() {
		var h models.Habit
		var weeklyChecks, monthlyChecks int
		err := rows.Scan(&h.ID, &h.UserID, &h.Title, &h.Description, &h.Color, &h.CreatedAt, &h.UpdatedAt, &weeklyChecks, &monthlyChecks)
		if err != nil {
			return nil, err
		}

		// Calculate weekly and monthly checks manually
		weeklyChecks = r.countChecksSince(userID, h.ID, 7)
		monthlyChecks = r.countChecksSince(userID, h.ID, 30)

		h.Streak = r.calculateStreak(userID, h.ID)
		h.WeeklyRate = float64(weeklyChecks) / 7.0 * 100
		if h.WeeklyRate > 100 {
			h.WeeklyRate = 100
		}
		h.MonthlyRate = float64(monthlyChecks) / 30.0 * 100
		if h.MonthlyRate > 100 {
			h.MonthlyRate = 100
		}

		var checkCount int
		r.db.QueryRow("SELECT COUNT(*) FROM habit_checks WHERE habit_id = $1 AND check_date = $2 AND user_id = $3", h.ID, today, h.UserID).Scan(&checkCount)
		h.CheckedToday = checkCount > 0

		habits = append(habits, h)
	}
	return habits, nil
}

func (r *HabitRepository) GetByID(userID, id int64) (*models.Habit, error) {
	var h models.Habit
	err := r.db.QueryRow(
		`SELECT id, user_id, title, description, color, created_at, updated_at FROM habits WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&h.ID, &h.UserID, &h.Title, &h.Description, &h.Color, &h.CreatedAt, &h.UpdatedAt)
	if err != nil {
		return nil, err
	}

	h.Streak = r.calculateStreak(userID, id)

	today := time.Now().Format("2006-01-02")
	var checkCount int
	r.db.QueryRow("SELECT COUNT(*) FROM habit_checks WHERE habit_id = $1 AND user_id = $2 AND check_date = $3", id, userID, today).Scan(&checkCount)
	h.CheckedToday = checkCount > 0

	return &h, nil
}

func (r *HabitRepository) Create(habit models.HabitCreate) (*models.Habit, error) {
	var id int64
	err := r.db.QueryRow(
		`INSERT INTO habits (user_id, title, description, color, created_at, updated_at) 
		 VALUES ($1, $2, $3, $4, NOW(), NOW())
		 RETURNING id`,
		habit.UserID, habit.Title, habit.Description, habit.Color,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return r.GetByID(habit.UserID, id)
}

func (r *HabitRepository) Update(userID, id int64, habit models.HabitUpdate) (*models.Habit, error) {
	query := "UPDATE habits SET updated_at = NOW()"
	args := []interface{}{}

	if habit.Title != "" {
		args = append(args, habit.Title)
		query += ", title = " + placeholder(len(args))
	}
	if habit.Description != "" {
		args = append(args, habit.Description)
		query += ", description = " + placeholder(len(args))
	}
	if habit.Color != "" {
		args = append(args, habit.Color)
		query += ", color = " + placeholder(len(args))
	}

	args = append(args, id, userID)
	query += " WHERE id = " + placeholder(len(args)-1) + " AND user_id = " + placeholder(len(args))

	_, err := r.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}

	return r.GetByID(userID, id)
}

func (r *HabitRepository) Delete(userID, id int64) error {
	_, err := r.db.Exec("DELETE FROM habits WHERE id = $1 AND user_id = $2", id, userID)
	return err
}

func (r *HabitRepository) Check(userID, habitID int64) error {
	today := time.Now().Format("2006-01-02")
	_, err := r.db.Exec(
		`INSERT INTO habit_checks (habit_id, user_id, check_date, created_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (habit_id, check_date) DO NOTHING`,
		habitID, userID, today,
	)
	return err
}

func (r *HabitRepository) Uncheck(userID, habitID int64) error {
	today := time.Now().Format("2006-01-02")
	_, err := r.db.Exec("DELETE FROM habit_checks WHERE habit_id = $1 AND user_id = $2 AND check_date = $3", habitID, userID, today)
	return err
}

func (r *HabitRepository) GetChecks(userID, habitID int64, days int) ([]models.HabitCheck, error) {
	query := `
		SELECT id, habit_id, user_id, check_date, created_at 
		FROM habit_checks 
		WHERE habit_id = $1 AND user_id = $2 AND check_date >= CURRENT_DATE - ($3::int * INTERVAL '1 day')
		ORDER BY check_date DESC
	`

	rows, err := r.db.Query(query, habitID, userID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var checks []models.HabitCheck
	for rows.Next() {
		var c models.HabitCheck
		if err := rows.Scan(&c.ID, &c.HabitID, &c.UserID, &c.CheckDate, &c.CreatedAt); err != nil {
			return nil, err
		}
		checks = append(checks, c)
	}
	return checks, nil
}

func (r *HabitRepository) calculateStreak(userID, habitID int64) int {
	query := `
		SELECT check_date FROM habit_checks 
		WHERE habit_id = $1 AND user_id = $2
		ORDER BY check_date DESC
	`

	rows, err := r.db.Query(query, habitID, userID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	var dates []time.Time
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			return 0
		}
		dates = append(dates, d)
	}

	if len(dates) == 0 {
		return 0
	}

	streak := 0
	today := time.Now().Truncate(24 * time.Hour)
	yesterday := today.Add(-24 * time.Hour)

	if dates[0].Truncate(24*time.Hour).Equal(yesterday) || dates[0].Truncate(24*time.Hour).Equal(today) {
		expectedDate := dates[0].Truncate(24 * time.Hour)
		for _, d := range dates {
			dDate := d.Truncate(24 * time.Hour)
			if dDate.Equal(expectedDate) {
				streak++
				expectedDate = expectedDate.Add(-24 * time.Hour)
			} else if dDate.Before(expectedDate) {
				break
			}
		}
	}

	return streak
}

func (r *HabitRepository) GetBestStreak(userID int64) (int, error) {
	var bestStreak int
	err := r.db.QueryRow(`
		SELECT COALESCE((
			SELECT MAX(streak) FROM (
				SELECT h.id, COUNT(hc.id) as streak
				FROM habits h
				LEFT JOIN habit_checks hc ON h.id = hc.habit_id AND hc.user_id = h.user_id
				WHERE h.user_id = $1
				GROUP BY h.id
			) t
		), 0)
	`, userID).Scan(&bestStreak)
	return bestStreak, err
}

func (r *HabitRepository) Count(userID int64) (int, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM habits WHERE user_id = $1", userID).Scan(&count)
	return count, err
}

// Helper function to count checks since given days
func (r *HabitRepository) countChecksSince(userID, habitID int64, days int) int {
	var count int
	cutoffDate := time.Now().AddDate(0, 0, -days).Format("2006-01-02")
	err := r.db.QueryRow(
		"SELECT COUNT(*) FROM habit_checks WHERE habit_id = $1 AND user_id = $2 AND check_date >= $3",
		habitID, userID, cutoffDate,
	).Scan(&count)
	if err != nil {
		return 0
	}
	return count
}
