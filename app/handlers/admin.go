package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/models"
	"habitracker/app/service"
)

type AdminHandler struct {
	service *service.AdminService
}

func NewAdminHandler(s *service.AdminService) *AdminHandler {
	return &AdminHandler{service: s}
}

func (h *AdminHandler) Stats(c *gin.Context) {
	stats, err := h.service.Stats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to load admin stats"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: stats})
}

func (h *AdminHandler) Users(c *gin.Context) {
	users, err := h.service.Users()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to load users"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: users})
}

func (h *AdminHandler) UpdateUserRole(c *gin.Context) {
	targetUserID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || targetUserID <= 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid user id"})
		return
	}

	var req models.AdminRoleUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format"})
		return
	}

	err = h.service.UpdateUserRole(middleware.GetUserID(c), targetUserID, req.Role, req.Confirm)
	if errors.Is(err, service.ErrInvalidRole) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Role must be user or admin"})
		return
	}
	if errors.Is(err, service.ErrSelfAdminDowngradeRequiresConfirm) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Confirm is required before changing your own admin role"})
		return
	}
	if errors.Is(err, service.ErrLastAdmin) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Cannot remove the last admin"})
		return
	}
	if errors.Is(err, service.ErrAdminUserNotFound) {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "User not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to update user role"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{"message": "Role updated"}})
}

func (h *AdminHandler) UpdateUserStatus(c *gin.Context) {
	targetUserID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || targetUserID <= 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid user id"})
		return
	}

	var req models.AdminStatusUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid request format"})
		return
	}

	err = h.service.UpdateUserStatus(middleware.GetUserID(c), targetUserID, req.Disabled)
	if errors.Is(err, service.ErrSelfDisable) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "You cannot disable your own account"})
		return
	}
	if errors.Is(err, service.ErrLastAdmin) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Cannot disable the last admin"})
		return
	}
	if errors.Is(err, service.ErrAdminUserNotFound) {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "User not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to update user status"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{"message": "Status updated"}})
}

func (h *AdminHandler) DeleteUser(c *gin.Context) {
	targetUserID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || targetUserID <= 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Invalid user id"})
		return
	}

	err = h.service.DeleteUser(middleware.GetUserID(c), targetUserID)
	if errors.Is(err, service.ErrSelfDelete) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "You cannot delete your own account"})
		return
	}
	if errors.Is(err, service.ErrLastAdmin) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Cannot delete the last admin"})
		return
	}
	if errors.Is(err, service.ErrAdminUserNotFound) {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "User not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{"message": "User deleted"}})
}
