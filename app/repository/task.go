package repository

import (
	"database/sql"
	"strings"

	"habitracker/app/models"
)

type TaskRepository struct {
	db *sql.DB
}

func NewTaskRepository(db *sql.DB) *TaskRepository {
	return &TaskRepository{db: db}
}

func (r *TaskRepository) GetAll(filter models.TaskFilter) ([]models.Task, error) {
	query := `
		SELECT id, user_id, title, description, priority, due_date, completed, created_at, updated_at
		FROM tasks`
	whereClause := []string{"user_id = $1"}
	args := []interface{}{filter.UserID}

	if filter.Status != "" && filter.Status != "all" {
		switch filter.Status {
		case "active":
			whereClause = append(whereClause, "completed = FALSE")
		case "completed":
			whereClause = append(whereClause, "completed = TRUE")
		case "today":
			whereClause = append(whereClause, "due_date::date = CURRENT_DATE")
		case "overdue":
			whereClause = append(whereClause, "due_date::date < CURRENT_DATE AND completed = FALSE")
		}
	}

	if filter.Priority != "" {
		args = append(args, filter.Priority)
		whereClause = append(whereClause, "priority = "+placeholder(len(args)))
	}

	if filter.Search != "" {
		args = append(args, "%"+filter.Search+"%", "%"+filter.Search+"%")
		whereClause = append(whereClause, "(title ILIKE "+placeholder(len(args)-1)+" OR description ILIKE "+placeholder(len(args))+")")
	}

	if len(whereClause) > 0 {
		query += " WHERE " + strings.Join(whereClause, " AND ")
	}
	query += " ORDER BY created_at DESC"

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		var task models.Task
		var dueDate sql.NullTime
		err := rows.Scan(&task.ID, &task.UserID, &task.Title, &task.Description, &task.Priority, &dueDate, &task.Completed, &task.CreatedAt, &task.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if dueDate.Valid {
			task.DueDate = &dueDate.Time
		}
		tasks = append(tasks, task)
	}

	return tasks, nil
}

func (r *TaskRepository) GetByID(id int64) (*models.Task, error) {
	var t models.Task
	var dueDate sql.NullTime
	err := r.db.QueryRow(
		`SELECT id, user_id, title, description, priority, due_date, completed, created_at, updated_at FROM tasks WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Priority, &dueDate, &t.Completed, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if dueDate.Valid {
		t.DueDate = &dueDate.Time
	}
	return &t, nil
}

func (r *TaskRepository) Create(task models.TaskCreate) (*models.Task, error) {
	var id int64
	err := r.db.QueryRow(
		`INSERT INTO tasks (user_id, title, description, priority, due_date, completed, created_at, updated_at) 
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		 RETURNING id`,
		task.UserID, task.Title, task.Description, task.Priority, task.DueDate, task.Completed,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return r.GetByID(id)
}

func (r *TaskRepository) Update(id int64, task models.TaskUpdate) (*models.Task, error) {
	query := "UPDATE tasks SET updated_at = NOW()"
	args := []interface{}{}

	if task.Title != "" {
		args = append(args, task.Title)
		query += ", title = " + placeholder(len(args))
	}
	if task.Description != "" {
		args = append(args, task.Description)
		query += ", description = " + placeholder(len(args))
	}
	if task.Priority != "" {
		args = append(args, task.Priority)
		query += ", priority = " + placeholder(len(args))
	}
	if task.DueDate != nil {
		args = append(args, task.DueDate)
		query += ", due_date = " + placeholder(len(args))
	}
	if task.Completed != nil {
		args = append(args, *task.Completed)
		query += ", completed = " + placeholder(len(args))
	}

	args = append(args, id)
	query += " WHERE id = " + placeholder(len(args))
	_, err := r.db.Exec(query, args...)
	if err != nil {
		return nil, err
	}

	return r.GetByID(id)
}

func (r *TaskRepository) Delete(id int64) error {
	_, err := r.db.Exec("DELETE FROM tasks WHERE id = $1", id)
	return err
}

func (r *TaskRepository) Toggle(id int64) (*models.Task, error) {
	_, err := r.db.Exec("UPDATE tasks SET completed = NOT completed, updated_at = NOW() WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func (r *TaskRepository) CountByStatus(userID int64) (total, active, completed, today, overdue int, err error) {
	err = r.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE user_id = $1", userID).Scan(&total)
	if err != nil {
		return
	}
	err = r.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND completed = FALSE", userID).Scan(&active)
	if err != nil {
		return
	}
	err = r.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND completed = TRUE", userID).Scan(&completed)
	if err != nil {
		return
	}
	err = r.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND due_date::date = CURRENT_DATE", userID).Scan(&today)
	if err != nil {
		return
	}
	err = r.db.QueryRow("SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND completed = FALSE AND due_date::date < CURRENT_DATE AND due_date IS NOT NULL", userID).Scan(&overdue)
	return
}
