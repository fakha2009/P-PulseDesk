package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/models"
	"habitracker/app/service"
)

type TaskHandler struct {
	service *service.TaskService
}

func NewTaskHandler(s *service.TaskService) *TaskHandler {
	return &TaskHandler{service: s}
}

func (h *TaskHandler) GetAll(c *gin.Context) {
	userID := middleware.GetUserID(c)
	filter := models.TaskFilter{
		UserID:   userID,
		Status:   c.Query("status"),
		Priority: models.Priority(c.Query("priority")),
		Search:   c.Query("search"),
	}

	tasks, err := h.service.GetAll(userID, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to load tasks: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: tasks})
}

func (h *TaskHandler) GetByID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid task ID format",
		})
		return
	}

	task, err := h.service.GetByID(userID, id)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Error:   "Task not found",
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: task})
}

func (h *TaskHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var task models.TaskCreate
	if err := c.ShouldBindJSON(&task); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	// Set user ID
	task.UserID = userID

	// Additional validation
	if err := validateTaskCreate(&task); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	created, err := h.service.Create(userID, task)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Failed to create task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Data: created})
}

func (h *TaskHandler) Update(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid task ID format",
		})
		return
	}

	var task models.TaskUpdate
	if err := c.ShouldBindJSON(&task); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid request format: " + err.Error(),
		})
		return
	}

	// Additional validation
	if err := validateTaskUpdate(&task); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	updated, err := h.service.Update(userID, id, task)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to update task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: updated})
}

func (h *TaskHandler) Delete(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid task ID format",
		})
		return
	}

	if err := h.service.Delete(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to delete task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true})
}

func (h *TaskHandler) Toggle(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "Invalid task ID format",
		})
		return
	}

	task, err := h.service.Toggle(userID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to toggle task: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: task})
}

// Validation functions
func validateTaskCreate(task *models.TaskCreate) error {
	if strings.TrimSpace(task.Title) == "" {
		return fmt.Errorf("title is required")
	}
	if len(task.Title) > 200 {
		return fmt.Errorf("title must be less than 200 characters")
	}
	if task.Priority != "" && task.Priority != models.PriorityLow && task.Priority != models.PriorityMedium && task.Priority != models.PriorityHigh {
		return fmt.Errorf("priority must be one of: low, medium, high")
	}
	if task.DueDate != nil && dueDateIsPast(*task.DueDate) {
		return fmt.Errorf("due date cannot be in the past")
	}
	return nil
}

func validateTaskUpdate(task *models.TaskUpdate) error {
	if task.Title != "" {
		if strings.TrimSpace(task.Title) == "" {
			return fmt.Errorf("title cannot be empty")
		}
		if len(task.Title) > 200 {
			return fmt.Errorf("title must be less than 200 characters")
		}
	}
	if task.Priority != "" && task.Priority != models.PriorityLow && task.Priority != models.PriorityMedium && task.Priority != models.PriorityHigh {
		return fmt.Errorf("priority must be one of: low, medium, high")
	}
	if task.DueDate != nil && dueDateIsPast(*task.DueDate) {
		return fmt.Errorf("due date cannot be in the past")
	}
	return nil
}

func dueDateIsPast(dueDate time.Time) bool {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	due := dueDate.In(now.Location())
	dueDay := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, now.Location())
	return dueDay.Before(today)
}
