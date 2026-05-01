package service

import (
	"errors"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var ErrValidationFailed = errors.New("validation failed")

type HabitService struct {
	repo *repository.HabitRepository
}

func NewHabitService(repo *repository.HabitRepository) *HabitService {
	return &HabitService{repo: repo}
}

func (s *HabitService) GetAll(userID int64) ([]models.Habit, error) {
	return s.repo.GetAll(userID)
}

func (s *HabitService) GetByID(userID, id int64) (*models.Habit, error) {
	return s.repo.GetByID(userID, id)
}

func (s *HabitService) Create(userID int64, habit models.HabitCreate) (*models.Habit, error) {
	if habit.Title == "" {
		return nil, ErrValidationFailed
	}
	if habit.Color == "" {
		habit.Color = "#6366f1"
	}
	habit.UserID = userID
	return s.repo.Create(habit)
}

func (s *HabitService) Update(userID, id int64, habit models.HabitUpdate) (*models.Habit, error) {
	if _, err := s.repo.GetByID(userID, id); err != nil {
		return nil, err
	}
	return s.repo.Update(userID, id, habit)
}

func (s *HabitService) Delete(userID, id int64) error {
	if _, err := s.repo.GetByID(userID, id); err != nil {
		return err
	}
	return s.repo.Delete(userID, id)
}

func (s *HabitService) Check(userID, habitID int64) error {
	if _, err := s.repo.GetByID(userID, habitID); err != nil {
		return err
	}
	return s.repo.Check(userID, habitID)
}

func (s *HabitService) Uncheck(userID, habitID int64) error {
	if _, err := s.repo.GetByID(userID, habitID); err != nil {
		return err
	}
	return s.repo.Uncheck(userID, habitID)
}

func (s *HabitService) ToggleCheck(userID, habitID int64) (bool, error) {
	habit, err := s.repo.GetByID(userID, habitID)
	if err != nil {
		return false, err
	}

	if habit.CheckedToday {
		err = s.repo.Uncheck(userID, habitID)
		return false, err
	} else {
		err = s.repo.Check(userID, habitID)
		return true, err
	}
}

func (s *HabitService) GetChecks(userID, habitID int64, days int) ([]models.HabitCheck, error) {
	return s.repo.GetChecks(userID, habitID, days)
}

func (s *HabitService) GetBestStreak(userID int64) (int, error) {
	return s.repo.GetBestStreak(userID)
}

func (s *HabitService) Count(userID int64) (int, error) {
	return s.repo.Count(userID)
}
