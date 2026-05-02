package service

import (
	"errors"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var ErrInvalidRole = errors.New("invalid role")
var ErrSelfAdminDowngradeRequiresConfirm = errors.New("confirm is required to change your own admin role")
var ErrLastAdmin = errors.New("cannot remove the last admin")
var ErrSelfDelete = errors.New("cannot delete your own account")
var ErrSelfDisable = errors.New("cannot disable your own account")
var ErrAdminUserNotFound = errors.New("user not found")

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
	currentRole, err := s.repo.UserRole(targetUserID)
	if err != nil {
		return ErrAdminUserNotFound
	}
	if currentRole == "admin" && role != "admin" {
		count, err := s.repo.AdminCount()
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrLastAdmin
		}
	}
	return s.repo.UpdateUserRole(targetUserID, role)
}

func (s *AdminService) UpdateUserStatus(currentUserID, targetUserID int64, disabled bool) error {
	if currentUserID == targetUserID && disabled {
		return ErrSelfDisable
	}
	role, err := s.repo.UserRole(targetUserID)
	if err != nil {
		return ErrAdminUserNotFound
	}
	if role == "admin" && disabled {
		count, err := s.repo.AdminCount()
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrLastAdmin
		}
	}
	return s.repo.UpdateUserStatus(targetUserID, disabled)
}

func (s *AdminService) DeleteUser(currentUserID, targetUserID int64) error {
	if currentUserID == targetUserID {
		return ErrSelfDelete
	}
	role, err := s.repo.UserRole(targetUserID)
	if err != nil {
		return ErrAdminUserNotFound
	}
	if role == "admin" {
		count, err := s.repo.AdminCount()
		if err != nil {
			return err
		}
		if count <= 1 {
			return ErrLastAdmin
		}
	}
	return s.repo.DeleteUser(targetUserID)
}
