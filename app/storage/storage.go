package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type StoredFile struct {
	Path     string
	FileName string
	MimeType string
	Size     int64
}

type Service struct {
	supabaseURL string
	serviceKey  string
	bucket      string
	localRoot   string
}

func NewFromEnv() *Service {
	return &Service{
		supabaseURL: strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		serviceKey:  os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		bucket:      getEnv("SUPABASE_STORAGE_BUCKET", "habit-proofs"),
		localRoot:   getEnv("UPLOAD_ROOT", "uploads"),
	}
}

func (s *Service) Save(ctx context.Context, userID, habitID int64, proofType, mimeType string, file multipart.File, header *multipart.FileHeader) (StoredFile, error) {
	name := safeFileName(header.Filename)
	ext := strings.ToLower(filepath.Ext(name))
	if ext == "" {
		ext = extensionForMime(mimeType)
	}
	objectName := fmt.Sprintf("%d-%s%s", time.Now().UnixNano(), randomSuffix(), ext)
	objectPath := fmt.Sprintf("habit-proofs/%d/%d/%s/%s", userID, habitID, proofType, objectName)

	if s.supabaseURL != "" && s.serviceKey != "" {
		if err := s.ensureSupabaseBucket(ctx); err != nil {
			return StoredFile{}, err
		}
		if err := s.saveSupabase(ctx, objectPath, mimeType, file); err != nil {
			return StoredFile{}, err
		}
		return StoredFile{Path: objectPath, FileName: name, MimeType: mimeType, Size: header.Size}, nil
	}

	localPath := filepath.Join(s.localRoot, filepath.FromSlash(objectPath))
	if err := os.MkdirAll(filepath.Dir(localPath), 0750); err != nil {
		return StoredFile{}, err
	}
	out, err := os.Create(localPath)
	if err != nil {
		return StoredFile{}, err
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		return StoredFile{}, err
	}

	return StoredFile{Path: objectPath, FileName: name, MimeType: mimeType, Size: header.Size}, nil
}

func (s *Service) Open(ctx context.Context, objectPath string) (io.ReadCloser, error) {
	cleanPath := strings.TrimLeft(filepath.ToSlash(filepath.Clean(objectPath)), "/")
	if cleanPath == "." || strings.HasPrefix(cleanPath, "../") || !strings.HasPrefix(cleanPath, "habit-proofs/") {
		return nil, fmt.Errorf("invalid file path")
	}

	if s.supabaseURL != "" && s.serviceKey != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/storage/v1/object/%s/%s", s.supabaseURL, s.bucket, cleanPath), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+s.serviceKey)
		req.Header.Set("apikey", s.serviceKey)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			resp.Body.Close()
			return nil, fmt.Errorf("storage returned %d", resp.StatusCode)
		}
		return resp.Body, nil
	}

	return os.Open(filepath.Join(s.localRoot, filepath.FromSlash(cleanPath)))
}

func (s *Service) Delete(ctx context.Context, objectPath string) error {
	cleanPath := strings.TrimLeft(filepath.ToSlash(filepath.Clean(objectPath)), "/")
	if cleanPath == "." || strings.HasPrefix(cleanPath, "../") || !strings.HasPrefix(cleanPath, "habit-proofs/") {
		return fmt.Errorf("invalid file path")
	}

	if s.supabaseURL != "" && s.serviceKey != "" {
		payload, err := json.Marshal(map[string][]string{"prefixes": []string{cleanPath}})
		if err != nil {
			return err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/storage/v1/object/%s/remove", s.supabaseURL, s.bucket), bytes.NewReader(payload))
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+s.serviceKey)
		req.Header.Set("apikey", s.serviceKey)
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf("storage delete failed with status %d", resp.StatusCode)
		}
		return nil
	}

	if err := os.Remove(filepath.Join(s.localRoot, filepath.FromSlash(cleanPath))); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *Service) saveSupabase(ctx context.Context, objectPath, mimeType string, file multipart.File) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/storage/v1/object/%s/%s", s.supabaseURL, s.bucket, objectPath), file)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.serviceKey)
	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("Content-Type", mimeType)
	req.Header.Set("x-upsert", "true")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("storage upload failed with status %d", resp.StatusCode)
	}
	return nil
}

func (s *Service) ensureSupabaseBucket(ctx context.Context) error {
	getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, s.supabaseURL+"/storage/v1/bucket/"+s.bucket, nil)
	if err != nil {
		return err
	}
	getReq.Header.Set("Authorization", "Bearer "+s.serviceKey)
	getReq.Header.Set("apikey", s.serviceKey)
	getResp, err := http.DefaultClient.Do(getReq)
	if err != nil {
		return err
	}
	getResp.Body.Close()
	if getResp.StatusCode >= 200 && getResp.StatusCode < 300 {
		return s.setBucketPrivate(ctx)
	}
	if getResp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("storage bucket check failed with status %d", getResp.StatusCode)
	}

	payload, err := json.Marshal(map[string]any{
		"id":     s.bucket,
		"name":   s.bucket,
		"public": false,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.supabaseURL+"/storage/v1/bucket", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.serviceKey)
	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict {
		return s.setBucketPrivate(ctx)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("storage bucket setup failed with status %d", resp.StatusCode)
	}
	return nil
}

func (s *Service) setBucketPrivate(ctx context.Context) error {
	payload, err := json.Marshal(map[string]any{"public": false})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, s.supabaseURL+"/storage/v1/bucket/"+s.bucket, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.serviceKey)
	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("storage bucket privacy update failed with status %d", resp.StatusCode)
	}
	return nil
}

func safeFileName(name string) string {
	base := filepath.Base(strings.TrimSpace(name))
	if base == "." || base == "" {
		return "proof-file"
	}
	return strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, base)
}

func extensionForMime(mimeType string) string {
	switch mimeType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "audio/webm":
		return ".webm"
	case "audio/mpeg", "audio/mp3":
		return ".mp3"
	case "audio/wav":
		return ".wav"
	default:
		return ".bin"
	}
}

func randomSuffix() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "file"
	}
	return hex.EncodeToString(b[:])
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
