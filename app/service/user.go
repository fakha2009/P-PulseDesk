package service

import (
	"errors"
	"strings"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var (
	ErrUserNotFound = errors.New("user not found")
	ErrEmailExists  = errors.New("email already exists")
	ErrInvalidTheme = errors.New("invalid theme")
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

func (s *UserService) GetPreferences(userID int64) (*models.UserPreferences, error) {
	prefs, err := s.repo.GetPreferences(userID)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return prefs, nil
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

func (s *UserService) UpdateTheme(id int64, theme string) (*models.User, error) {
	if theme != "light" && theme != "dark" {
		return nil, ErrInvalidTheme
	}

	user, err := s.repo.UpdateTheme(id, theme)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *UserService) UpdateOnboarding(id int64, completed bool) (*models.User, error) {
	user, err := s.repo.UpdateOnboarding(id, completed)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

func (s *UserService) RecordSession(userID int64, userAgent, ip string) error {
	session := models.UserSession{
		UserID:    userID,
		UserAgent: strings.TrimSpace(userAgent),
		IP:        strings.TrimSpace(ip),
	}
	session.DeviceType = detectDeviceType(session.UserAgent)
	session.Browser = detectBrowser(session.UserAgent)
	session.OS = detectOS(session.UserAgent)
	if session.UserAgent == "" {
		session.UserAgent = "Unknown"
	}
	return s.repo.RecordSession(session)
}

func (s *UserService) TouchSession(userID int64, userAgent, ip string) {
	_ = s.repo.TouchSession(userID, strings.TrimSpace(userAgent), strings.TrimSpace(ip))
}

func (s *UserService) UpdatePreferences(userID int64, prefs models.UserPreferencesUpdate) (*models.UserPreferences, error) {
	if prefs.Theme != "" && prefs.Theme != "light" && prefs.Theme != "dark" && prefs.Theme != "system" {
		return nil, ErrInvalidTheme
	}
	if prefs.Accent != "" && prefs.Accent != "purple-blue" && prefs.Accent != "blue" && prefs.Accent != "emerald" && prefs.Accent != "rose" && prefs.Accent != "amber" {
		return nil, errors.New("invalid accent")
	}
	if prefs.Density != "" && prefs.Density != "comfortable" && prefs.Density != "compact" {
		return nil, errors.New("invalid density")
	}
	if prefs.Motion != "" && prefs.Motion != "normal" && prefs.Motion != "reduced" {
		return nil, errors.New("invalid motion")
	}

	updated, err := s.repo.UpdatePreferences(userID, prefs)
	if err != nil {
		return nil, ErrUserNotFound
	}
	return updated, nil
}

func (s *UserService) Delete(id int64) error {
	err := s.repo.Delete(id)
	if err != nil {
		return ErrUserNotFound
	}
	return nil
}

func detectDeviceType(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") || strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		return "mobile"
	}
	return "desktop"
}

func detectBrowser(userAgent string) string {
	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "edg/"):
		return "Edge"
	case strings.Contains(ua, "opr/") || strings.Contains(ua, "opera"):
		return "Opera"
	case strings.Contains(ua, "chrome/") || strings.Contains(ua, "crios/"):
		return "Chrome"
	case strings.Contains(ua, "firefox/") || strings.Contains(ua, "fxios/"):
		return "Firefox"
	case strings.Contains(ua, "safari/"):
		return "Safari"
	default:
		return "Unknown"
	}
}

func detectOS(userAgent string) string {
	ua := strings.ToLower(userAgent)
	switch {
	case strings.Contains(ua, "iphone"):
		return "iPhone"
	case strings.Contains(ua, "ipad"):
		return "iPad"
	case strings.Contains(ua, "android"):
		return "Android"
	case strings.Contains(ua, "windows"):
		return "Windows"
	case strings.Contains(ua, "mac os"):
		return "macOS"
	case strings.Contains(ua, "linux"):
		return "Linux"
	default:
		return "Unknown"
	}
}
