package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

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
		SELECT id, user_id, title, description, priority, due_date, recurrence, sort_order, completed, created_at, updated_at
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
		case "tomorrow":
			whereClause = append(whereClause, "due_date::date = CURRENT_DATE + INTERVAL '1 day'")
		case "week":
			whereClause = append(whereClause, "due_date::date >= CURRENT_DATE AND due_date::date < CURRENT_DATE + INTERVAL '7 days'")
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
	query += " ORDER BY sort_order ASC, due_date ASC NULLS LAST, created_at DESC"

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []models.Task
	for rows.Next() {
		var task models.Task
		var dueDate sql.NullTime
		err := rows.Scan(&task.ID, &task.UserID, &task.Title, &task.Description, &task.Priority, &dueDate, &task.Recurrence, &task.SortOrder, &task.Completed, &task.CreatedAt, &task.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if dueDate.Valid {
			task.DueDate = &dueDate.Time
		}
		tasks = append(tasks, task)
	}

	if err := r.loadSubtasks(tasks); err != nil {
		return nil, err
	}

	return tasks, nil
}

func (r *TaskRepository) GetByID(id int64) (*models.Task, error) {
	var t models.Task
	var dueDate sql.NullTime
	err := r.db.QueryRow(
		`SELECT id, user_id, title, description, priority, due_date, recurrence, sort_order, completed, created_at, updated_at FROM tasks WHERE id = $1`,
		id,
	).Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Priority, &dueDate, &t.Recurrence, &t.SortOrder, &t.Completed, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if dueDate.Valid {
		t.DueDate = &dueDate.Time
	}
	subtasks, err := r.GetSubtasks(id)
	if err != nil {
		return nil, err
	}
	t.Subtasks = subtasks
	return &t, nil
}

func (r *TaskRepository) Create(task models.TaskCreate) (*models.Task, error) {
	var id int64
	err := r.db.QueryRow(
		`INSERT INTO tasks (user_id, title, description, priority, due_date, recurrence, sort_order, completed, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sort_order) + 1 FROM tasks WHERE user_id = $1), 0), $7, NOW(), NOW())
		 RETURNING id`,
		task.UserID, task.Title, task.Description, task.Priority, task.DueDate, normalizedRecurrence(task.Recurrence), task.Completed,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	if err := r.ReplaceSubtasks(id, task.Subtasks); err != nil {
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
	if task.Recurrence != "" {
		args = append(args, normalizedRecurrence(task.Recurrence))
		query += ", recurrence = " + placeholder(len(args))
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
	if task.Subtasks != nil {
		if err := r.ReplaceSubtasks(id, task.Subtasks); err != nil {
			return nil, err
		}
	}

	return r.GetByID(id)
}

func (r *TaskRepository) Delete(id int64) error {
	_, err := r.db.Exec("DELETE FROM tasks WHERE id = $1", id)
	return err
}

func (r *TaskRepository) Toggle(id int64) (*models.Task, error) {
	task, err := r.GetByID(id)
	if err != nil {
		return nil, err
	}
	if !task.Completed && task.Recurrence != "none" && task.DueDate != nil {
		nextDue := nextRecurringDue(*task.DueDate, task.Recurrence)
		_, err = r.db.Exec("UPDATE tasks SET due_date = $2, completed = FALSE, updated_at = NOW() WHERE id = $1", id, nextDue)
	} else {
		_, err = r.db.Exec("UPDATE tasks SET completed = NOT completed, updated_at = NOW() WHERE id = $1", id)
	}
	if err != nil {
		return nil, err
	}
	return r.GetByID(id)
}

func (r *TaskRepository) Reorder(userID int64, ids []int64) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for index, id := range ids {
		result, err := tx.Exec("UPDATE tasks SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3", index, id, userID)
		if err != nil {
			return err
		}
		if affected, _ := result.RowsAffected(); affected == 0 {
			return fmt.Errorf("task %d not found", id)
		}
	}
	return tx.Commit()
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

func (r *TaskRepository) GetSubtasks(taskID int64) ([]models.Subtask, error) {
	rows, err := r.db.Query(`SELECT id, task_id, title, completed, sort_order, created_at, updated_at
		FROM task_subtasks WHERE task_id = $1 ORDER BY sort_order ASC, id ASC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	subtasks := []models.Subtask{}
	for rows.Next() {
		var subtask models.Subtask
		if err := rows.Scan(&subtask.ID, &subtask.TaskID, &subtask.Title, &subtask.Completed, &subtask.SortOrder, &subtask.CreatedAt, &subtask.UpdatedAt); err != nil {
			return nil, err
		}
		subtasks = append(subtasks, subtask)
	}
	return subtasks, rows.Err()
}

func (r *TaskRepository) ReplaceSubtasks(taskID int64, subtasks []models.Subtask) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM task_subtasks WHERE task_id = $1", taskID); err != nil {
		return err
	}
	for index, subtask := range subtasks {
		title := strings.TrimSpace(subtask.Title)
		if title == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT INTO task_subtasks (task_id, title, completed, sort_order, created_at, updated_at)
			VALUES ($1, $2, $3, $4, NOW(), NOW())`, taskID, title, subtask.Completed, index); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *TaskRepository) ToggleSubtask(taskID, subtaskID int64) (*models.Subtask, error) {
	_, err := r.db.Exec("UPDATE task_subtasks SET completed = NOT completed, updated_at = NOW() WHERE id = $1 AND task_id = $2", subtaskID, taskID)
	if err != nil {
		return nil, err
	}
	var subtask models.Subtask
	err = r.db.QueryRow(`SELECT id, task_id, title, completed, sort_order, created_at, updated_at
		FROM task_subtasks WHERE id = $1 AND task_id = $2`, subtaskID, taskID).
		Scan(&subtask.ID, &subtask.TaskID, &subtask.Title, &subtask.Completed, &subtask.SortOrder, &subtask.CreatedAt, &subtask.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &subtask, nil
}

func (r *TaskRepository) loadSubtasks(tasks []models.Task) error {
	for i := range tasks {
		subtasks, err := r.GetSubtasks(tasks[i].ID)
		if err != nil {
			return err
		}
		tasks[i].Subtasks = subtasks
	}
	return nil
}

func normalizedRecurrence(value string) string {
	switch value {
	case "daily", "weekly", "monthly":
		return value
	default:
		return "none"
	}
}

func nextRecurringDue(due time.Time, recurrence string) time.Time {
	next := due
	for !next.After(time.Now()) {
		switch recurrence {
		case "daily":
			next = next.AddDate(0, 0, 1)
		case "weekly":
			next = next.AddDate(0, 0, 7)
		case "monthly":
			next = next.AddDate(0, 1, 0)
		default:
			return due
		}
	}
	return next
}
