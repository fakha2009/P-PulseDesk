package handlers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/models"
	"habitracker/app/service"
	storagepkg "habitracker/app/storage"
)

type HabitHandler struct {
	service *service.HabitService
	storage *storagepkg.Service
}

func NewHabitHandler(s *service.HabitService, storage *storagepkg.Service) *HabitHandler {
	return &HabitHandler{service: s, storage: storage}
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
		if err == service.ErrProofRequired {
			c.JSON(http.StatusBadRequest, models.APIResponse{
				Success: false,
				Error:   "Для этой привычки нужно добавить подтверждение",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to toggle habit check: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Data: gin.H{"checked": checked}})
}

func (h *HabitHandler) CreateProof(c *gin.Context) {
	userID := middleware.GetUserID(c)
	habitID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid habit id"})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 21<<20)
	if err := c.Request.ParseMultipartForm(21 << 20); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Файл слишком большой или форма некорректна"})
		return
	}

	completionDate := time.Now()
	if rawDate := strings.TrimSpace(c.PostForm("completion_date")); rawDate != "" {
		parsed, err := time.Parse("2006-01-02", rawDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid completion_date"})
			return
		}
		completionDate = parsed
	}

	proofType := strings.TrimSpace(c.PostForm("type"))
	note := strings.TrimSpace(c.PostForm("note"))
	habit, err := h.service.GetByID(userID, habitID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "habit not found"})
		return
	}
	if habit.ProofType == "" || habit.ProofType == "none" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "proof is not required for this habit"})
		return
	}
	if !proofTypeMatchesRequirement(habit.ProofType, proofType) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid proof type for this habit"})
		return
	}

	create := models.HabitProofCreate{
		CompletionDate: completionDate,
		Type:           proofType,
		TextNote:       note,
	}

	if proofType == "photo" || proofType == "audio" {
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Файл подтверждения обязателен"})
			return
		}
		defer file.Close()

		mimeType, err := detectProofMime(file)
		if err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "Не удалось прочитать файл"})
			return
		}
		if err := validateProofFile(proofType, mimeType, header.Size); err != nil {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
			return
		}

		stored, err := h.storage.Save(c.Request.Context(), userID, habitID, proofType, mimeType, file, header)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Error: "Не удалось загрузить файл"})
			return
		}
		create.FileURL = stored.Path
		create.FileName = stored.FileName
		create.MimeType = stored.MimeType
		create.FileSize = stored.Size
	}

	proof, err := h.service.CreateProof(userID, habitID, create)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Data: proof})
}

func (h *HabitHandler) ProofFile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	habitID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid habit id"})
		return
	}
	proofID, err := strconv.ParseInt(c.Param("proofID"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Error: "invalid proof id"})
		return
	}

	proof, err := h.service.GetProof(userID, habitID, proofID)
	if err != nil || proof.FileURL == "" {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "proof file not found"})
		return
	}

	reader, err := h.storage.Open(c.Request.Context(), proof.FileURL)
	if err != nil {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Error: "proof file not found"})
		return
	}
	defer reader.Close()

	c.Header("Content-Type", proof.MimeType)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, strings.ReplaceAll(proof.FileName, `"`, "")))
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, reader)
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
	if !validHabitProofType(habit.ProofType) {
		return fmt.Errorf("proof_type must be one of: none, note, photo, audio, photo_or_audio")
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
	if !validHabitProofType(habit.ProofType) {
		return fmt.Errorf("proof_type must be one of: none, note, photo, audio, photo_or_audio")
	}
	return nil
}

func validHabitProofType(value string) bool {
	switch value {
	case "", "none", "note", "photo", "audio", "photo_or_audio":
		return true
	default:
		return false
	}
}

func proofTypeMatchesRequirement(required, submitted string) bool {
	switch required {
	case "note":
		return submitted == "note"
	case "photo":
		return submitted == "photo"
	case "audio":
		return submitted == "audio"
	case "photo_or_audio":
		return submitted == "photo" || submitted == "audio"
	default:
		return false
	}
}

func validateProofFile(proofType, mimeType string, size int64) error {
	if proofType == "photo" {
		if mimeType != "image/jpeg" && mimeType != "image/png" && mimeType != "image/webp" {
			return fmt.Errorf("Поддерживаются только JPEG, PNG или WebP")
		}
		if size > 5<<20 {
			return fmt.Errorf("Фото должно быть меньше 5MB")
		}
		return nil
	}

	if mimeType != "audio/webm" && mimeType != "audio/mpeg" && mimeType != "audio/mp3" && mimeType != "audio/wav" && mimeType != "audio/x-wav" && mimeType != "audio/wave" {
		return fmt.Errorf("Поддерживаются только WebM, MP3 или WAV")
	}
	if size > 20<<20 {
		return fmt.Errorf("Аудио должно быть меньше 20MB")
	}
	return nil
}

func detectProofMime(file multipartFile) (string, error) {
	buffer := make([]byte, 512)
	n, err := file.Read(buffer)
	if err != nil && err != io.EOF {
		return "", err
	}
	if seeker, ok := file.(io.Seeker); ok {
		if _, err := seeker.Seek(0, io.SeekStart); err != nil {
			return "", err
		}
	}
	sample := buffer[:n]
	detected := http.DetectContentType(sample)
	switch {
	case detected == "image/jpeg" || detected == "image/png" || detected == "image/webp":
		return detected, nil
	case len(sample) >= 4 && bytes.Equal(sample[:4], []byte{'R', 'I', 'F', 'F'}) && bytes.Contains(sample[:min(len(sample), 16)], []byte("WAVE")):
		return "audio/wav", nil
	case len(sample) >= 3 && bytes.Equal(sample[:3], []byte("ID3")):
		return "audio/mpeg", nil
	case len(sample) >= 2 && sample[0] == 0xFF && sample[1]&0xE0 == 0xE0:
		return "audio/mpeg", nil
	case len(sample) >= 4 && bytes.Equal(sample[:4], []byte{0x1A, 0x45, 0xDF, 0xA3}):
		return "audio/webm", nil
	default:
		return detected, nil
	}
}

type multipartFile interface {
	io.Reader
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
