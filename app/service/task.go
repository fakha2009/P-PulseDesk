package service

import (
	"errors"

	"habitracker/app/models"
	"habitracker/app/repository"
)

type TaskService struct {
	repo *repository.TaskRepository
}

func NewTaskService(repo *repository.TaskRepository) *TaskService {
	return &TaskService{repo: repo}
}

func (s *TaskService) GetAll(userID int64, filter models.TaskFilter) ([]models.Task, error) {
	// Add user_id filter to the filter
	filter.UserID = userID
	return s.repo.GetAll(filter)
}

func (s *TaskService) GetByID(userID, id int64) (*models.Task, error) {
	task, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	// Ensure user can only access their own tasks
	if task.UserID != userID {
		return nil, errors.New("task not found")
	}

	return task, nil
}

func (s *TaskService) Create(userID int64, task models.TaskCreate) (*models.Task, error) {
	// Add user_id to task
	task.UserID = userID
	if task.Title == "" {
		return nil, errors.New("validation failed")
	}
	if task.Priority == "" {
		task.Priority = models.PriorityMedium
	}
	return s.repo.Create(task)
}

func (s *TaskService) Update(userID, id int64, task models.TaskUpdate) (*models.Task, error) {
	// First check ownership
	_, err := s.GetByID(userID, id)
	if err != nil {
		return nil, err
	}

	return s.repo.Update(id, task)
}

func (s *TaskService) Delete(userID, id int64) error {
	// First check ownership
	_, err := s.GetByID(userID, id)
	if err != nil {
		return err
	}

	return s.repo.Delete(id)
}

func (s *TaskService) Toggle(userID, id int64) (*models.Task, error) {
	// First check ownership
	_, err := s.GetByID(userID, id)
	if err != nil {
		return nil, err
	}

	return s.repo.Toggle(id)
}

func (s *TaskService) CountByStatus(userID int64) (int, int, int, int, int, error) {
	return s.repo.CountByStatus(userID)
}
