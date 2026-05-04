package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/models"
	"habitracker/app/service"
)

type ProofHandler struct {
	service *service.ProofService
}

func NewProofHandler(s *service.ProofService) *ProofHandler {
	return &ProofHandler{service: s}
}

func (h *ProofHandler) List(c *gin.Context) {
	page := parsePositiveInt(c.Query("page"), 1)
	limit := parsePositiveInt(c.Query("limit"), 24)
	proofType := c.Query("type")
	dateFrom, err := parseOptionalDate(c.Query("date_from"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid date_from"})
		return
	}
	dateTo, err := parseOptionalDate(c.Query("date_to"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid date_to"})
		return
	}

	response, err := h.service.List(middleware.GetUserID(c), page, limit, proofType, dateFrom, dateTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to load proof library"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: response})
}

func (h *ProofHandler) Delete(c *gin.Context) {
	proofID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || proofID <= 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid proof id"})
		return
	}

	err = h.service.Delete(c.Request.Context(), middleware.GetUserID(c), proofID)
	if errors.Is(err, service.ErrProofNotFound) {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "proof not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to delete proof file"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{"message": "Proof deleted"}})
}

func parsePositiveInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func parseOptionalDate(value string) (*time.Time, error) {
	if value == "" {
		return nil, nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
