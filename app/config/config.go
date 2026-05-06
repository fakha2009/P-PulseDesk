package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Database DatabaseConfig
	JWT      JWTConfig
	Server   ServerConfig
	AppEnv   string
}

type DatabaseConfig struct {
	URL      string
	Host     string
	Port     int
	Database string
	Username string
	Password string
}

type JWTConfig struct {
	Secret string
}

type ServerConfig struct {
	Port                    int
	CORSOrigin              string
	UploadRateLimit         int
	UploadRateWindowSeconds int
}

func Load() (*Config, error) {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		fmt.Printf("Warning: Could not load .env file: %v\n", err)
	}

	config := &Config{
		AppEnv: getEnv("APP_ENV", "local"),
		Database: DatabaseConfig{
			URL:      getEnv("DATABASE_URL", ""),
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnvInt("DB_PORT", 5432),
			Database: getEnv("DB_DATABASE", "todolist"),
			Username: getEnv("DB_USERNAME", "root"),
			Password: getEnv("DB_PASSWORD", ""),
		},
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", ""),
		},
		Server: ServerConfig{
			Port:                    getEnvInt("PORT", getEnvInt("APP_PORT", 8082)),
			CORSOrigin:              getEnv("CORS_ORIGIN", ""),
			UploadRateLimit:         getEnvInt("UPLOAD_RATE_LIMIT", 10),
			UploadRateWindowSeconds: getEnvInt("UPLOAD_RATE_WINDOW_SECONDS", 60),
		},
	}

	// Validate required fields
	if config.Database.URL != "" {
		if config.JWT.Secret == "" {
			return nil, fmt.Errorf("JWT_SECRET is required")
		}
		if len(config.JWT.Secret) < 32 {
			return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters long")
		}
		return config, nil
	}

	if config.Database.Host == "" {
		return nil, fmt.Errorf("DB_HOST is required")
	}
	if config.Database.Database == "" {
		return nil, fmt.Errorf("DB_DATABASE is required")
	}
	if config.Database.Username == "" {
		return nil, fmt.Errorf("DB_USERNAME is required")
	}
	if config.JWT.Secret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if len(config.JWT.Secret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters long")
	}

	return config, nil
}

func (c *DatabaseConfig) DSN() string {
	if c.URL != "" {
		return withPGXPoolerOptions(c.URL)
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable",
		c.Username, c.Password, c.Host, c.Port, c.Database)
}

func (c *DatabaseConfig) SourceLabel() string {
	if c.URL != "" {
		return "DATABASE_URL"
	}
	return "DB_* fallback"
}

func withPGXPoolerOptions(databaseURL string) string {
	if strings.Contains(databaseURL, "default_query_exec_mode=") {
		return databaseURL
	}
	separator := "?"
	if strings.Contains(databaseURL, "?") {
		separator = "&"
	}
	return databaseURL + separator + "default_query_exec_mode=simple_protocol"
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
