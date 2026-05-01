package service

import (
	"habitracker/app/models"
)

type StatsService struct {
	taskService  *TaskService
	habitService *HabitService
}

func NewStatsService(taskService *TaskService, habitService *HabitService) *StatsService {
	return &StatsService{
		taskService:  taskService,
		habitService: habitService,
	}
}

func (s *StatsService) Get(userID int64) (*models.Stats, error) {
	total, active, completed, today, overdue, err := s.taskService.CountByStatus(userID)
	if err != nil {
		return nil, err
	}

	habitCount, err := s.habitService.Count(userID)
	if err != nil {
		return nil, err
	}

	bestStreak, err := s.habitService.GetBestStreak(userID)
	if err != nil {
		return nil, err
	}

	taskScore := 100
	if total > 0 {
		taskScore = completed * 100 / total
	}
	habitScore := 100
	if habitCount > 0 {
		habitScore = bestStreak * 100 / 7
		if habitScore > 100 {
			habitScore = 100
		}
	}

	return &models.Stats{
		TotalTasks:        total,
		ActiveTasks:       active,
		CompletedToday:    completed,
		Overdue:           overdue,
		ActiveHabits:      habitCount,
		BestStreak:        bestStreak,
		TasksToday:        today,
		ProductivityScore: (taskScore + habitScore) / 2,
	}, nil
}
