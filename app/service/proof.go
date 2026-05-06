package service

import (
	"context"
	"errors"
	"time"

	"habitracker/app/models"
	"habitracker/app/repository"
	"habitracker/app/storage"
)

var ErrProofNotFound = errors.New("proof not found")

type ProofService struct {
	repo    *repository.ProofRepository
	storage *storage.Service
}

func NewProofService(repo *repository.ProofRepository, storageService *storage.Service) *ProofService {
	return &ProofService{repo: repo, storage: storageService}
}

func (s *ProofService) List(userID int64, page, limit int, proofType string, dateFrom, dateTo *time.Time) (*models.ProofLibraryResponse, error) {
	if proofType != "" && proofType != "photo" && proofType != "audio" && proofType != "note" {
		proofType = ""
	}
	return s.repo.List(repository.ProofFilter{
		UserID:   userID,
		Page:     page,
		Limit:    limit,
		Type:     proofType,
		DateFrom: dateFrom,
		DateTo:   dateTo,
	})
}

func (s *ProofService) Delete(ctx context.Context, userID, proofID int64) error {
	proof, err := s.repo.Get(userID, proofID)
	if err != nil {
		return ErrProofNotFound
	}
	if proof.FileURL != "" {
		if err := s.storage.Delete(ctx, proof.FileURL); err != nil {
			return err
		}
	}
	return s.repo.Delete(userID, proofID)
}
