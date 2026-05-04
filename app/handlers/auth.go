package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"habitracker/app/models"
	"habitracker/app/service"
	"habitracker/app/utils"
)

type AuthHandler struct {
	userService     *service.UserService
	passwordManager *utils.PasswordManager
	jwtManager      *utils.JWTManager
}

func NewAuthHandler(userService *service.UserService, passwordManager *utils.PasswordManager, jwtManager *utils.JWTManager) *AuthHandler {
	return &AuthHandler{
		userService:     userService,
		passwordManager: passwordManager,
		jwtManager:      jwtManager,
	}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req models.UserCreate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	// Validate passwords match
	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Passwords do not match",
		})
		return
	}

	// Validate email
	if err := utils.ValidateEmail(req.Email); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Validate password
	if err := h.passwordManager.Validate(req.Password); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Hash password
	hashedPassword, err := h.passwordManager.Hash(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to process password",
		})
		return
	}

	// Create user
	user, err := h.userService.Create(req.Name, req.Email, hashedPassword)
	if err != nil {
		if errors.Is(err, service.ErrEmailExists) || strings.Contains(err.Error(), "Duplicate entry") || strings.Contains(err.Error(), "duplicate key") {
			c.JSON(http.StatusConflict, models.APIResponse{
				Success: false,
				Error:   "Email already exists",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to create user: " + err.Error(),
		})
		return
	}

	// Generate JWT token
	token, err := h.jwtManager.Generate(user.ID, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
		return
	}
	_ = h.userService.RecordSession(user.ID, c.GetHeader("User-Agent"), c.ClientIP())

	c.JSON(http.StatusCreated, models.APIResponse{
		Success: true,
		Data: gin.H{
			"user":  user,
			"token": token,
		},
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req models.UserLogin
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	// Get user by email
	user, err := h.userService.GetByEmail(req.Email)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "Invalid email or password",
		})
		return
	}

	// Verify password
	if err := h.passwordManager.Verify(user.PasswordHash, req.Password); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "Invalid email or password",
		})
		return
	}
	if user.Disabled {
		c.JSON(http.StatusForbidden, models.APIResponse{
			Success: false,
			Error:   "Account is disabled",
		})
		return
	}

	// Generate JWT token
	token, err := h.jwtManager.Generate(user.ID, user.Email, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
		return
	}
	_ = h.userService.RecordSession(user.ID, c.GetHeader("User-Agent"), c.ClientIP())

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: gin.H{
			"user":  user,
			"token": token,
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "User not found in context",
		})
		return
	}

	user, err := h.userService.GetByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
		return
	}
	h.userService.TouchSession(userID, c.GetHeader("User-Agent"), c.ClientIP())

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: gin.H{
			"id":                   user.ID,
			"name":                 user.Name,
			"email":                user.Email,
			"role":                 user.Role,
			"theme":                user.Theme,
			"disabled":             user.Disabled,
			"onboarding_completed": user.OnboardingCompleted,
			"created_at":           user.CreatedAt,
		},
	})
}

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "User not found in context",
		})
		return
	}

	var req models.UserUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Name is required",
		})
		return
	}
	if len(name) > 120 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Name must be less than 120 characters",
		})
		return
	}

	user, err := h.userService.Update(userID, name)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    user,
	})
}

func (h *AuthHandler) UpdateTheme(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "User not found in context",
		})
		return
	}

	var req models.UserThemeUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	theme := strings.TrimSpace(req.Theme)
	user, err := h.userService.UpdateTheme(userID, theme)
	if err != nil {
		status := http.StatusNotFound
		message := "User not found"
		if errors.Is(err, service.ErrInvalidTheme) {
			status = http.StatusBadRequest
			message = "Theme must be light or dark"
		}
		c.JSON(status, models.APIResponse{
			Success: false,
			Error:   message,
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: gin.H{
			"id":                   user.ID,
			"name":                 user.Name,
			"email":                user.Email,
			"role":                 user.Role,
			"theme":                user.Theme,
			"disabled":             user.Disabled,
			"onboarding_completed": user.OnboardingCompleted,
			"created_at":           user.CreatedAt,
		},
	})
}

func (h *AuthHandler) UpdateOnboarding(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Error: "User not found in context"})
		return
	}

	var req models.UserOnboardingUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format"})
		return
	}

	user, err := h.userService.UpdateOnboarding(userID, req.Completed)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "User not found"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{
		"id":                   user.ID,
		"name":                 user.Name,
		"email":                user.Email,
		"role":                 user.Role,
		"theme":                user.Theme,
		"disabled":             user.Disabled,
		"onboarding_completed": user.OnboardingCompleted,
		"created_at":           user.CreatedAt,
	}})
}

func (h *AuthHandler) Preferences(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Error: "User not found in context"})
		return
	}

	prefs, err := h.userService.GetPreferences(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "User not found"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: prefs})
}

func (h *AuthHandler) UpdatePreferences(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Error: "User not found in context"})
		return
	}

	var req models.UserPreferencesUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format"})
		return
	}

	prefs, err := h.userService.UpdatePreferences(userID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: prefs})
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "User not found in context",
		})
		return
	}

	var req models.UserPasswordUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	if req.NewPassword != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Passwords do not match",
		})
		return
	}

	if err := h.passwordManager.Validate(req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	user, err := h.userService.GetWithPasswordByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "User not found",
		})
		return
	}

	if err := h.passwordManager.Verify(user.PasswordHash, req.CurrentPassword); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Error:   "Current password is incorrect",
		})
		return
	}

	hashedPassword, err := h.passwordManager.Hash(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to process password",
		})
		return
	}

	if err := h.userService.UpdatePassword(userID, hashedPassword); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to update password",
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    gin.H{"message": "Password updated successfully"},
	})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	// In a real-world scenario, you might want to implement token blacklisting
	// For now, we'll just return success
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    gin.H{"message": "Logged out successfully"},
	})
}
