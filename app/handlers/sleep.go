package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/models"
	"habitracker/app/service"
)

type SleepHandler struct {
	service *service.SleepService
}

func NewSleepHandler(s *service.SleepService) *SleepHandler {
	return &SleepHandler{service: s}
}

func (h *SleepHandler) GetSettings(c *gin.Context) {
	settings, err := h.service.GetSettings(middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to load sleep settings"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: settings})
}

func (h *SleepHandler) UpdateSettings(c *gin.Context) {
	var req models.SleepSettingsUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format: " + err.Error()})
		return
	}

	settings, err := h.service.UpdateSettings(middleware.GetUserID(c), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: settings})
}

func (h *SleepHandler) GetLogs(c *gin.Context) {
	logs, err := h.service.GetLogs(middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to load sleep logs"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: logs})
}

func (h *SleepHandler) CreateLog(c *gin.Context) {
	var req models.SleepLogCreate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format: " + err.Error()})
		return
	}

	log, err := h.service.CreateLog(middleware.GetUserID(c), req)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "Duplicate entry") {
			status = http.StatusConflict
		}
		c.JSON(status, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Data: log})
}

func (h *SleepHandler) UpdateLog(c *gin.Context) {
	id, ok := parseSleepID(c)
	if !ok {
		return
	}

	var req models.SleepLogUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format: " + err.Error()})
		return
	}

	log, err := h.service.UpdateLog(middleware.GetUserID(c), id, req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrSleepNotFound), errors.Is(err, sql.ErrNoRows):
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "Sleep log not found"})
		case strings.Contains(err.Error(), "Duplicate entry"):
			c.JSON(http.StatusConflict, models.APIResponse{Success: false, Error: "Sleep log for this date already exists"})
		default:
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
		}
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: log})
}

func (h *SleepHandler) DeleteLog(c *gin.Context) {
	id, ok := parseSleepID(c)
	if !ok {
		return
	}

	if err := h.service.DeleteLog(middleware.GetUserID(c), id); err != nil {
		if errors.Is(err, service.ErrSleepNotFound) || errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "Sleep log not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to delete sleep log"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true})
}

func (h *SleepHandler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats(middleware.GetUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to load sleep stats"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: stats})
}

func parseSleepID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid sleep log ID format"})
		return 0, false
	}
	return id, true
}
