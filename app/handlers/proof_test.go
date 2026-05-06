package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"

	"habitracker/app/middleware"
	"habitracker/app/repository"
	"habitracker/app/service"
	"habitracker/app/storage"
)

type fakeProofStore struct {
	saveCalled   bool
	openCalled   bool
	deleteCalled bool
}

func (s *fakeProofStore) Save(_ context.Context, _ int64, _ int64, _ string, mimeType string, _ multipart.File, header *multipart.FileHeader) (storage.StoredFile, error) {
	s.saveCalled = true
	return storage.StoredFile{
		Path:     "habit-proofs/1/7/photo/proof.png",
		FileName: header.Filename,
		MimeType: mimeType,
		Size:     header.Size,
	}, nil
}

func (s *fakeProofStore) Open(_ context.Context, _ string) (io.ReadCloser, error) {
	s.openCalled = true
	return io.NopCloser(bytes.NewBufferString("proof-file")), nil
}

func (s *fakeProofStore) Delete(_ context.Context, _ string) error {
	s.deleteCalled = true
	return nil
}

func newProofTestDB(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	return db, mock
}

func withUser(userID int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	}
}

func withRequiredTestAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("Authorization") == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Authorization header required"})
			c.Abort()
			return
		}
		c.Set("user_id", int64(1))
		c.Next()
	}
}

func newProofHandlers(db *sql.DB, store storage.FileStore) (*ProofHandler, *HabitHandler) {
	habitRepo := repository.NewHabitRepository(db)
	proofRepo := repository.NewProofRepository(db)
	habitService := service.NewHabitService(habitRepo)
	proofService := service.NewProofService(proofRepo, store)
	return NewProofHandler(proofService), NewHabitHandler(habitService, store)
}

func expectHabitFound(mock sqlmock.Sqlmock, userID, habitID int64, proofType string) {
	now := time.Now()
	mock.ExpectQuery("SELECT id, user_id, title, description, color, proof_type").
		WithArgs(habitID, userID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "user_id", "title", "description", "color", "proof_type", "proof_prompt", "created_at", "updated_at"}).
			AddRow(habitID, userID, "Read", "", "#6366f1", proofType, "", now, now))
	mock.ExpectQuery("SELECT check_date FROM habit_checks").
		WithArgs(habitID, userID).
		WillReturnRows(sqlmock.NewRows([]string{"check_date"}))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM habit_checks WHERE habit_id = $1 AND user_id = $2 AND check_date = $3")).
		WithArgs(habitID, userID, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(regexp.QuoteMeta("SELECT COUNT(*) FROM habit_proofs WHERE habit_id = $1 AND user_id = $2 AND completion_date = $3")).
		WithArgs(habitID, userID, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
}

func expectHabitMissing(mock sqlmock.Sqlmock, userID, habitID int64) {
	mock.ExpectQuery("SELECT id, user_id, title, description, color, proof_type").
		WithArgs(habitID, userID).
		WillReturnError(sql.ErrNoRows)
}

func TestProofListFiltersByUserTypeDateAndPagination(t *testing.T) {
	db, mock := newProofTestDB(t)
	defer db.Close()

	proofs, _ := newProofHandlers(db, &fakeProofStore{})
	router := gin.New()
	router.Use(withUser(1))
	router.GET("/api/proofs", proofs.List)

	dateFrom := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2026, 5, 6, 0, 0, 0, 0, time.UTC)
	mock.ExpectQuery("SELECT COUNT").
		WithArgs(int64(1), "photo", dateFrom, dateTo).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(25))
	mock.ExpectQuery("SELECT hp.id").
		WithArgs(int64(1), "photo", dateFrom, dateTo, 24, 0).
		WillReturnRows(sqlmock.NewRows([]string{"id", "habit_id", "title", "type", "text_note", "file_url", "file_name", "mime_type", "file_size", "completion_date", "created_at"}).
			AddRow(10, 7, "Read", "photo", "", "habit-proofs/x", "proof.png", "image/png", 100, dateFrom, time.Now()))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/proofs?type=photo&date_from=2026-05-01&date_to=2026-05-06&page=1&limit=24", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Success bool `json:"success"`
		Data    struct {
			Page    int  `json:"page"`
			Limit   int  `json:"limit"`
			Total   int  `json:"total"`
			HasMore bool `json:"has_more"`
			Items   []struct {
				ID int64 `json:"id"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.Success || body.Data.Page != 1 || body.Data.Limit != 24 || body.Data.Total != 25 || !body.Data.HasMore || len(body.Data.Items) != 1 {
		t.Fatalf("unexpected response: %+v", body)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestProofListUnauthenticatedReturns401(t *testing.T) {
	db, _ := newProofTestDB(t)
	defer db.Close()

	proofs, _ := newProofHandlers(db, &fakeProofStore{})
	router := gin.New()
	router.Use(withRequiredTestAuth())
	router.GET("/api/proofs", proofs.List)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/proofs", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCreateNoteProof(t *testing.T) {
	db, mock := newProofTestDB(t)
	defer db.Close()

	_, habits := newProofHandlers(db, &fakeProofStore{})
	router := gin.New()
	router.Use(withUser(1))
	router.POST("/api/habits/:id/proofs", habits.CreateProof)

	expectHabitFound(mock, 1, 7, "note")
	expectHabitFound(mock, 1, 7, "note")
	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO habit_proofs").
		WithArgs(int64(7), int64(1), sqlmock.AnyArg(), "note", "done", "", "", "", int64(0)).
		WillReturnRows(proofRows().AddRow(3, 7, 1, time.Now(), "note", "done", "", "", "", 0, time.Now(), time.Now()))
	mock.ExpectExec("INSERT INTO habit_checks").
		WithArgs(int64(7), int64(1), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	body, contentType := multipartBody(t, map[string]string{"type": "note", "note": "done"}, nil)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/habits/7/proofs", body)
	req.Header.Set("Content-Type", contentType)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreatePhotoProof(t *testing.T) {
	db, mock := newProofTestDB(t)
	defer db.Close()

	store := &fakeProofStore{}
	_, habits := newProofHandlers(db, store)
	router := gin.New()
	router.Use(withUser(1))
	router.POST("/api/habits/:id/proofs", habits.CreateProof)

	expectHabitFound(mock, 1, 7, "photo")
	expectHabitFound(mock, 1, 7, "photo")
	mock.ExpectBegin()
	mock.ExpectQuery("INSERT INTO habit_proofs").
		WithArgs(int64(7), int64(1), sqlmock.AnyArg(), "photo", "", "habit-proofs/1/7/photo/proof.png", "proof.png", "image/png", sqlmock.AnyArg()).
		WillReturnRows(proofRows().AddRow(3, 7, 1, time.Now(), "photo", "", "habit-proofs/1/7/photo/proof.png", "proof.png", "image/png", 67, time.Now(), time.Now()))
	mock.ExpectExec("INSERT INTO habit_checks").
		WithArgs(int64(7), int64(1), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	body, contentType := multipartBody(t, map[string]string{"type": "photo"}, &testProofFile{name: "proof.png", content: pngBytes()})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/habits/7/proofs", body)
	req.Header.Set("Content-Type", contentType)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !store.saveCalled {
		t.Fatal("expected storage save")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestCreateProofRejectsWrongMimeTooLargeAndForeignHabit(t *testing.T) {
	tests := []struct {
		name      string
		fields    map[string]string
		file      *testProofFile
		setupMock func(sqlmock.Sqlmock)
	}{
		{
			name:   "wrong mime",
			fields: map[string]string{"type": "photo"},
			file:   &testProofFile{name: "proof.html", content: []byte("<script>alert(1)</script>")},
			setupMock: func(mock sqlmock.Sqlmock) {
				expectHabitFound(mock, 1, 7, "photo")
			},
		},
		{
			name:   "too large photo",
			fields: map[string]string{"type": "photo"},
			file:   &testProofFile{name: "proof.png", content: append(pngBytes(), bytes.Repeat([]byte{0}, 5<<20)...)},
			setupMock: func(mock sqlmock.Sqlmock) {
				expectHabitFound(mock, 1, 7, "photo")
			},
		},
		{
			name:   "foreign or invalid habit",
			fields: map[string]string{"type": "note", "note": "done"},
			setupMock: func(mock sqlmock.Sqlmock) {
				expectHabitMissing(mock, 1, 7)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := newProofTestDB(t)
			defer db.Close()
			store := &fakeProofStore{}
			_, habits := newProofHandlers(db, store)
			router := gin.New()
			router.Use(withUser(1))
			router.POST("/api/habits/:id/proofs", habits.CreateProof)
			tt.setupMock(mock)

			body, contentType := multipartBody(t, tt.fields, tt.file)
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/api/habits/7/proofs", body)
			req.Header.Set("Content-Type", contentType)
			router.ServeHTTP(rec, req)

			if rec.Code < 400 {
				t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
			}
			if store.saveCalled {
				t.Fatal("storage save should not be called")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestProofFileOwnerCanAccessAndAnotherUserCannot(t *testing.T) {
	t.Run("owner", func(t *testing.T) {
		db, mock := newProofTestDB(t)
		defer db.Close()
		store := &fakeProofStore{}
		_, habits := newProofHandlers(db, store)
		router := gin.New()
		router.Use(withUser(1))
		router.GET("/api/habits/:id/proofs/:proofID/file", habits.ProofFile)

		expectHabitFound(mock, 1, 7, "photo")
		now := time.Now()
		mock.ExpectQuery("SELECT id, habit_id, user_id, completion_date, type").
			WithArgs(int64(3), int64(7), int64(1)).
			WillReturnRows(proofRows().AddRow(3, 7, 1, now, "photo", "", "habit-proofs/x", "proof.png", "image/png", 10, now, now))

		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/habits/7/proofs/3/file", nil)
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
		}
		if !store.openCalled {
			t.Fatal("expected storage open")
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("another user", func(t *testing.T) {
		db, mock := newProofTestDB(t)
		defer db.Close()
		store := &fakeProofStore{}
		_, habits := newProofHandlers(db, store)
		router := gin.New()
		router.Use(withUser(2))
		router.GET("/api/habits/:id/proofs/:proofID/file", habits.ProofFile)

		expectHabitMissing(mock, 2, 7)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/habits/7/proofs/3/file", nil)
		router.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
		}
		if store.openCalled {
			t.Fatal("storage open should not be called")
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestDeleteProofOwnerDeletesDatabaseAndStorage(t *testing.T) {
	db, mock := newProofTestDB(t)
	defer db.Close()

	store := &fakeProofStore{}
	proofs, _ := newProofHandlers(db, store)
	router := gin.New()
	router.Use(withUser(1))
	router.DELETE("/api/proofs/:id", proofs.Delete)

	now := time.Now()
	mock.ExpectQuery("SELECT id, habit_id, user_id, completion_date, type").
		WithArgs(int64(3), int64(1)).
		WillReturnRows(proofRows().AddRow(3, 7, 1, now, "photo", "", "habit-proofs/x", "proof.png", "image/png", 10, now, now))
	mock.ExpectExec(regexp.QuoteMeta("DELETE FROM habit_proofs WHERE id = $1 AND user_id = $2")).
		WithArgs(int64(3), int64(1)).
		WillReturnResult(sqlmock.NewResult(0, 1))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/proofs/3", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !store.deleteCalled {
		t.Fatal("expected storage delete")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUploadRateLimitRejectsFlood(t *testing.T) {
	db, _ := newProofTestDB(t)
	defer db.Close()

	_, habits := newProofHandlers(db, &fakeProofStore{})
	router := gin.New()
	router.Use(withUser(1))
	router.POST("/api/habits/:id/proofs", middleware.NewRateLimiter(1, time.Minute).Middleware(), habits.CreateProof)

	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/habits/7/proofs", bytes.NewBufferString(""))
		router.ServeHTTP(rec, req)
		if i == 1 && rec.Code != http.StatusTooManyRequests {
			t.Fatalf("second request status = %d, body = %s", rec.Code, rec.Body.String())
		}
	}
}

type testProofFile struct {
	name    string
	content []byte
}

func multipartBody(t *testing.T, fields map[string]string, file *testProofFile) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatal(err)
		}
	}
	if file != nil {
		part, err := writer.CreateFormFile("file", file.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := part.Write(file.content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return body, writer.FormDataContentType()
}

func proofRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "habit_id", "user_id", "completion_date", "type", "text_note", "file_url",
		"file_name", "mime_type", "file_size", "created_at", "updated_at",
	})
}

func pngBytes() []byte {
	return []byte{
		0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n',
		0x00, 0x00, 0x00, 0x0d, 'I', 'H', 'D', 'R',
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
		0x00, 0x00, 0x00, 0x0a, 'I', 'D', 'A', 'T',
		0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
		0x0d, 0x0a, 0x2d, 0xb4,
		0x00, 0x00, 0x00, 0x00, 'I', 'E', 'N', 'D',
	}
}
