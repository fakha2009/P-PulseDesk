package service

import (
	"errors"
	"fmt"
	"strings"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var ErrValidationFailed = errors.New("validation failed")
var ErrProofRequired = errors.New("habit proof required")

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
	if !validProofType(habit.ProofType) {
		return nil, ErrValidationFailed
	}
	habit.ProofType = normalizeProofType(habit.ProofType)
	habit.ProofPrompt = strings.TrimSpace(habit.ProofPrompt)
	habit.UserID = userID
	return s.repo.Create(habit)
}

func (s *HabitService) Update(userID, id int64, habit models.HabitUpdate) (*models.Habit, error) {
	if _, err := s.repo.GetByID(userID, id); err != nil {
		return nil, err
	}
	if !validProofType(habit.ProofType) {
		return nil, ErrValidationFailed
	}
	habit.ProofType = normalizeProofType(habit.ProofType)
	habit.ProofPrompt = strings.TrimSpace(habit.ProofPrompt)
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
	}

	if habit.ProofType != "" && habit.ProofType != "none" {
		return false, ErrProofRequired
	}

	err = s.repo.Check(userID, habitID)
	return true, err
}

func (s *HabitService) GetChecks(userID, habitID int64, days int) ([]models.HabitCheck, error) {
	return s.repo.GetChecks(userID, habitID, days)
}

func (s *HabitService) CreateProof(userID, habitID int64, proof models.HabitProofCreate) (*models.HabitProof, error) {
	habit, err := s.repo.GetByID(userID, habitID)
	if err != nil {
		return nil, err
	}

	if habit.ProofType == "" || habit.ProofType == "none" {
		return nil, fmt.Errorf("proof is not required for this habit")
	}

	if !proofTypeMatchesHabit(habit.ProofType, proof.Type) {
		return nil, fmt.Errorf("invalid proof type for this habit")
	}

	if proof.Type == "note" && strings.TrimSpace(proof.TextNote) == "" {
		return nil, fmt.Errorf("note is required")
	}
	if (proof.Type == "photo" || proof.Type == "audio") && strings.TrimSpace(proof.FileURL) == "" {
		return nil, fmt.Errorf("file is required")
	}

	proof.UserID = userID
	proof.HabitID = habitID
	proof.TextNote = strings.TrimSpace(proof.TextNote)
	return s.repo.CreateProof(proof)
}

func (s *HabitService) GetProof(userID, habitID, proofID int64) (*models.HabitProof, error) {
	if _, err := s.repo.GetByID(userID, habitID); err != nil {
		return nil, err
	}
	return s.repo.GetProof(userID, habitID, proofID)
}

func (s *HabitService) GetBestStreak(userID int64) (int, error) {
	return s.repo.GetBestStreak(userID)
}

func (s *HabitService) Count(userID int64) (int, error) {
	return s.repo.Count(userID)
}

func validProofType(value string) bool {
	switch value {
	case "", "none", "note", "photo", "audio", "photo_or_audio":
		return true
	default:
		return false
	}
}

func normalizeProofType(value string) string {
	if value == "" {
		return "none"
	}
	return value
}

func proofTypeMatchesHabit(required, submitted string) bool {
	switch required {
	case "note":
		return submitted == "note"
	case "photo":
		return submitted == "photo"
	case "audio":
		return submitted == "audio"
	case "photo_or_audio":
		return submitted == "photo" || submitted == "audio"
	default:
		return false
	}
}
