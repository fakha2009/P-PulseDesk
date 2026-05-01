package service

import (
	"errors"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var ErrInvalidRole = errors.New("invalid role")
var ErrSelfAdminDowngradeRequiresConfirm = errors.New("confirm is required to change your own admin role")

type AdminService struct {
	repo *repository.AdminRepository
}

func NewAdminService(repo *repository.AdminRepository) *AdminService {
	return &AdminService{repo: repo}
}

func (s *AdminService) Stats() (*models.AdminStats, error) {
	return s.repo.Stats()
}

func (s *AdminService) Users() ([]models.AdminUserSummary, error) {
	return s.repo.Users()
}

func (s *AdminService) UpdateUserRole(currentUserID, targetUserID int64, role string, confirm bool) error {
	if role != "user" && role != "admin" {
		return ErrInvalidRole
	}
	if currentUserID == targetUserID && role != "admin" && !confirm {
		return ErrSelfAdminDowngradeRequiresConfirm
	}
	return s.repo.UpdateUserRole(targetUserID, role)
}
