package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/models"
	"habitracker/app/service"
)

type HabitHandler struct {
	service *service.HabitService
}

func NewHabitHandler(s *service.HabitService) *HabitHandler {
	return &HabitHandler{service: s}
}

func (h *HabitHandler) GetAll(c *gin.Context) {
	habits, err := h.service.GetAll(middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: habits})
}

func (h *HabitHandler) GetByID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid id"})
		return
	}

	habit, err := h.service.GetByID(userID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "habit not found"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: habit})
}

func (h *HabitHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var habit models.HabitCreate
	if err := c.ShouldBindJSON(&habit); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	// Additional validation
	if err := validateHabitCreate(&habit); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	created, err := h.service.Create(userID, habit)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Failed to create habit: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Data: created})
}

func (h *HabitHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid habit ID format",
		})
		return
	}

	var habit models.HabitUpdate
	if err := c.ShouldBindJSON(&habit); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	// Additional validation
	if err := validateHabitUpdate(&habit); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	updated, err := h.service.Update(userID, id, habit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to update habit: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: updated})
}

func (h *HabitHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid id"})
		return
	}

	if err := h.service.Delete(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true})
}

func (h *HabitHandler) Check(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid habit ID format",
		})
		return
	}

	checked, err := h.service.ToggleCheck(userID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to toggle habit check: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{"checked": checked}})
}

// Validation functions for habits
func validateHabitCreate(habit *models.HabitCreate) error {
	if strings.TrimSpace(habit.Title) == "" {
		return fmt.Errorf("title is required")
	}
	if len(habit.Title) > 100 {
		return fmt.Errorf("title must be less than 100 characters")
	}
	if !strings.HasPrefix(habit.Color, "#") || len(habit.Color) != 7 {
		return fmt.Errorf("color must be a valid hex color (e.g., #FF5733)")
	}
	return nil
}

func validateHabitUpdate(habit *models.HabitUpdate) error {
	if habit.Title != "" {
		if strings.TrimSpace(habit.Title) == "" {
			return fmt.Errorf("title cannot be empty")
		}
		if len(habit.Title) > 100 {
			return fmt.Errorf("title must be less than 100 characters")
		}
	}
	if habit.Color != "" {
		if !strings.HasPrefix(habit.Color, "#") || len(habit.Color) != 7 {
			return fmt.Errorf("color must be a valid hex color (e.g., #FF5733)")
		}
	}
	return nil
}
