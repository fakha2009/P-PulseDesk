package models

import "time"

type Priority string

const (
	PriorityLow    Priority = "low"
	PriorityMedium Priority = "medium"
	PriorityHigh   Priority = "high"
)

type User struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Role         string    `json:"role"`
	Theme        string    `json:"theme"`
	Disabled     bool      `json:"disabled"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type AdminStats struct {
	TotalUsers        int                `json:"total_users"`
	NewUsersToday     int                `json:"new_users_today"`
	TotalTasks        int                `json:"total_tasks"`
	CompletedTasks    int                `json:"completed_tasks"`
	TotalHabits       int                `json:"total_habits"`
	TotalSleepLogs    int                `json:"total_sleep_logs"`
	ActivityLast7Days []AdminActivityDay `json:"activity_last_7_days"`
}

type AdminActivityDay struct {
	Date      string `json:"date"`
	Tasks     int    `json:"tasks"`
	Habits    int    `json:"habits"`
	SleepLogs int    `json:"sleep_logs"`
	Users     int    `json:"users"`
	Total     int    `json:"total"`
}

type AdminUserSummary struct {
	ID            int64     `json:"id"`
	Name          string    `json:"name"`
	Email         string    `json:"email"`
	Role          string    `json:"role"`
	Disabled      bool      `json:"disabled"`
	CreatedAt     time.Time `json:"created_at"`
	TaskCount     int       `json:"task_count"`
	HabitCount    int       `json:"habit_count"`
	SleepLogCount int       `json:"sleep_log_count"`
}

type AdminRoleUpdate struct {
	Role    string `json:"role"`
	Confirm bool   `json:"confirm"`
}

type AdminStatusUpdate struct {
	Disabled bool `json:"disabled"`
	Confirm  bool `json:"confirm"`
}

type UserCreate struct {
	Name            string `json:"name" validate:"required,min=1,max=120"`
	Email           string `json:"email" validate:"required,email,max=190"`
	Password        string `json:"password" validate:"required,min=8"`
	ConfirmPassword string `json:"confirm_password" validate:"required"`
}

type UserLogin struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type UserUpdate struct {
	Name string `json:"name" validate:"omitempty,min=1,max=120"`
}

type UserPasswordUpdate struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
	ConfirmPassword string `json:"confirm_password" validate:"required"`
}

type UserThemeUpdate struct {
	Theme string `json:"theme" validate:"required,oneof=light dark"`
}

type UserPreferences struct {
	UserID         int64     `json:"user_id"`
	Theme          string    `json:"theme"`
	Accent         string    `json:"accent"`
	Density        string    `json:"density"`
	Motion         string    `json:"motion"`
	BackgroundGlow bool      `json:"backgroundGlow"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type UserPreferencesUpdate struct {
	Theme          string `json:"theme"`
	Accent         string `json:"accent"`
	Density        string `json:"density"`
	Motion         string `json:"motion"`
	BackgroundGlow *bool  `json:"backgroundGlow"`
}

type Task struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	Priority    Priority   `json:"priority"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Recurrence  string     `json:"recurrence"`
	SortOrder   int        `json:"sort_order"`
	Completed   bool       `json:"completed"`
	Subtasks    []Subtask  `json:"subtasks,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type TaskFilter struct {
	UserID   int64
	Status   string // all, active, completed, today, overdue
	Priority Priority
	Search   string
}

type TaskCreate struct {
	UserID      int64      `json:"user_id"`
	Title       string     `json:"title" validate:"required,min=1,max=200"`
	Description string     `json:"description"`
	Priority    Priority   `json:"priority" validate:"required,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date"`
	Recurrence  string     `json:"recurrence"`
	Subtasks    []Subtask  `json:"subtasks"`
	Completed   bool       `json:"completed"`
}

type TaskUpdate struct {
	Title       string     `json:"title" validate:"omitempty,min=1,max=200"`
	Description string     `json:"description"`
	Priority    Priority   `json:"priority" validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date"`
	Recurrence  string     `json:"recurrence"`
	Subtasks    []Subtask  `json:"subtasks"`
	Completed   *bool      `json:"completed"`
}

type Subtask struct {
	ID        int64     `json:"id,omitempty"`
	TaskID    int64     `json:"task_id,omitempty"`
	Title     string    `json:"title"`
	Completed bool      `json:"completed"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

type TaskReorder struct {
	IDs []int64 `json:"ids"`
}

type Habit struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	Title        string    `json:"title"`
	Description  string    `json:"description,omitempty"`
	Color        string    `json:"color"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Streak       int       `json:"streak"`
	WeeklyRate   float64   `json:"weekly_rate"`
	MonthlyRate  float64   `json:"monthly_rate"`
	CheckedToday bool      `json:"checked_today"`
}

type HabitCreate struct {
	UserID      int64  `json:"user_id"`
	Title       string `json:"title" validate:"required,min=1,max=100"`
	Description string `json:"description"`
	Color       string `json:"color" validate:"required,hexcolor"`
}

type HabitUpdate struct {
	Title       string `json:"title" validate:"omitempty,min=1,max=100"`
	Description string `json:"description"`
	Color       string `json:"color" validate:"omitempty,hexcolor"`
}

type HabitCheck struct {
	ID        int64     `json:"id"`
	HabitID   int64     `json:"habit_id"`
	UserID    int64     `json:"user_id"`
	CheckDate time.Time `json:"check_date"`
	CreatedAt time.Time `json:"created_at"`
}

type Stats struct {
	TotalTasks        int `json:"total_tasks"`
	CompletedToday    int `json:"completed_today"`
	Overdue           int `json:"overdue"`
	ActiveHabits      int `json:"active_habits"`
	BestStreak        int `json:"best_streak"`
	TasksToday        int `json:"tasks_today"`
	ActiveTasks       int `json:"active_tasks"`
	ProductivityScore int `json:"productivity_score"`
}

type SleepQuality string

const (
	SleepQualityPoor   SleepQuality = "poor"
	SleepQualityNormal SleepQuality = "normal"
	SleepQualityGreat  SleepQuality = "great"
)

type SleepSettings struct {
	ID             int64     `json:"id"`
	UserID         int64     `json:"user_id"`
	TargetBedTime  string    `json:"target_bed_time"`
	TargetWakeTime string    `json:"target_wake_time"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type SleepSettingsUpdate struct {
	TargetBedTime  string `json:"target_bed_time"`
	TargetWakeTime string `json:"target_wake_time"`
}

type SleepLog struct {
	ID              int64        `json:"id"`
	UserID          int64        `json:"user_id"`
	SleepDate       string       `json:"sleep_date"`
	BedTime         time.Time    `json:"bed_time"`
	WakeTime        time.Time    `json:"wake_time"`
	DurationMinutes int          `json:"duration_minutes"`
	Quality         SleepQuality `json:"quality"`
	Note            string       `json:"note,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
}

type SleepLogCreate struct {
	SleepDate string `json:"sleep_date"`
	BedTime   string `json:"bed_time"`
	WakeTime  string `json:"wake_time"`
	Quality   string `json:"quality"`
	Note      string `json:"note"`
}

type SleepLogUpdate struct {
	SleepDate string `json:"sleep_date"`
	BedTime   string `json:"bed_time"`
	WakeTime  string `json:"wake_time"`
	Quality   string `json:"quality"`
	Note      string `json:"note"`
}

type SleepStats struct {
	AverageDurationMinutes int           `json:"average_duration_minutes"`
	TargetDurationMinutes  int           `json:"target_duration_minutes"`
	BestDay                *SleepLog     `json:"best_day,omitempty"`
	WorstDay               *SleepLog     `json:"worst_day,omitempty"`
	CompliantDays          int           `json:"compliant_days"`
	DaysLogged             int           `json:"days_logged"`
	Recommendation         string        `json:"recommendation"`
	Status                 string        `json:"status"`
	Today                  *SleepLog     `json:"today,omitempty"`
	Week                   []SleepLog    `json:"week"`
	Settings               SleepSettings `json:"settings"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}
