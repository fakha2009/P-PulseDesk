package service

import (
	"errors"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var (
	ErrUserNotFound = errors.New("user not found")
	ErrEmailExists  = errors.New("email already exists")
)

type UserService struct {
	repo *repository.UserRepository
}

func NewUserService(repo *repository.UserRepository) *UserService {
	return &UserService{repo: repo}
}

func (s *UserService) Create(name, email, passwordHash string) (*models.User, error) {
	// Check if email already exists
	exists, err := s.repo.Exists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailExists
	}

	return s.repo.Create(name, email, passwordHash)
}

func (s *UserService) GetByID(id int64) (*models.User, error) {
	user, err := s.repo.GetByID(id)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *UserService) GetByEmail(email string) (*models.User, error) {
	user, err := s.repo.GetByEmail(email)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *UserService) GetWithPasswordByID(id int64) (*models.User, error) {
	user, err := s.repo.GetWithPasswordByID(id)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *UserService) Update(id int64, name string) (*models.User, error) {
	user, err := s.repo.Update(id, name)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *UserService) UpdatePassword(id int64, passwordHash string) error {
	if err := s.repo.UpdatePassword(id, passwordHash); err != nil {
		return ErrUserNotFound
	}
	return nil
}

func (s *UserService) Delete(id int64) error {
	err := s.repo.Delete(id)
	if err != nil {
		return ErrUserNotFound
	}
	return nil
}
