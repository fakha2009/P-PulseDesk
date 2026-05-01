package repository

import (
	"database/sql"
	"time"

	"habitracker/app/models"
)

type AdminRepository struct {
	db *sql.DB
}

func NewAdminRepository(db *sql.DB) *AdminRepository {
	return &AdminRepository{db: db}
}

func (r *AdminRepository) Stats() (*models.AdminStats, error) {
	stats := &models.AdminStats{}
	queries := []struct {
		query string
		dest  *int
	}{
		{"SELECT COUNT(*) FROM users", &stats.TotalUsers},
		{"SELECT COUNT(*) FROM users WHERE created_at::date = CURRENT_DATE", &stats.NewUsersToday},
		{"SELECT COUNT(*) FROM tasks", &stats.TotalTasks},
		{"SELECT COUNT(*) FROM tasks WHERE completed = TRUE", &stats.CompletedTasks},
		{"SELECT COUNT(*) FROM habits", &stats.TotalHabits},
		{"SELECT COUNT(*) FROM sleep_logs", &stats.TotalSleepLogs},
	}

	for _, item := range queries {
		if err := r.db.QueryRow(item.query).Scan(item.dest); err != nil {
			return nil, err
		}
	}

	activity := make([]models.AdminActivityDay, 0, 7)
	for offset := 6; offset >= 0; offset-- {
		day := time.Now().AddDate(0, 0, -offset).Format("2006-01-02")
		item := models.AdminActivityDay{Date: day}
		if err := r.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE created_at::date = $1", day).Scan(&item.Tasks); err != nil {
			return nil, err
		}
		if err := r.db.QueryRow("SELECT COUNT(*) FROM habits WHERE created_at::date = $1", day).Scan(&item.Habits); err != nil {
			return nil, err
		}
		if err := r.db.QueryRow("SELECT COUNT(*) FROM sleep_logs WHERE created_at::date = $1", day).Scan(&item.SleepLogs); err != nil {
			return nil, err
		}
		if err := r.db.QueryRow("SELECT COUNT(*) FROM users WHERE created_at::date = $1", day).Scan(&item.Users); err != nil {
			return nil, err
		}
		item.Total = item.Tasks + item.Habits + item.SleepLogs + item.Users
		activity = append(activity, item)
	}
	stats.ActivityLast7Days = activity

	return stats, nil
}

func (r *AdminRepository) Users() ([]models.AdminUserSummary, error) {
	rows, err := r.db.Query(`
		SELECT
			u.id,
			u.name,
			u.email,
			u.role,
			u.created_at,
			COUNT(DISTINCT t.id) AS task_count,
			COUNT(DISTINCT h.id) AS habit_count,
			COUNT(DISTINCT sl.id) AS sleep_log_count
		FROM users u
		LEFT JOIN tasks t ON t.user_id = u.id
		LEFT JOIN habits h ON h.user_id = u.id
		LEFT JOIN sleep_logs sl ON sl.user_id = u.id
		GROUP BY u.id, u.name, u.email, u.role, u.created_at
		ORDER BY u.created_at DESC, u.id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]models.AdminUserSummary, 0)
	for rows.Next() {
		var user models.AdminUserSummary
		if err := rows.Scan(
			&user.ID,
			&user.Name,
			&user.Email,
			&user.Role,
			&user.CreatedAt,
			&user.TaskCount,
			&user.HabitCount,
			&user.SleepLogCount,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

func (r *AdminRepository) UpdateUserRole(id int64, role string) error {
	_, err := r.db.Exec("UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2", role, id)
	return err
}
