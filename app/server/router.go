package server

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"habitracker/app/config"
	"habitracker/app/database"
	"habitracker/app/handlers"
	"habitracker/app/middleware"
	"habitracker/app/repository"
	"habitracker/app/service"
	"habitracker/app/utils"
)

func NewRouter(cfg *config.Config, db *database.DB) *gin.Engine {
	userRepo := repository.NewUserRepository(db.DB)
	taskRepo := repository.NewTaskRepository(db.DB)
	habitRepo := repository.NewHabitRepository(db.DB)
	sleepRepo := repository.NewSleepRepository(db.DB)
	adminRepo := repository.NewAdminRepository(db.DB)

	userService := service.NewUserService(userRepo)
	taskService := service.NewTaskService(taskRepo)
	habitService := service.NewHabitService(habitRepo)
	sleepService := service.NewSleepService(sleepRepo)
	statsService := service.NewStatsService(taskService, habitService)
	adminService := service.NewAdminService(adminRepo)

	passwordManager := utils.NewPasswordManager()
	jwtManager := utils.NewJWTManager(cfg.JWT.Secret)

	authHandler := handlers.NewAuthHandler(userService, passwordManager, jwtManager)
	taskHandler := handlers.NewTaskHandler(taskService)
	habitHandler := handlers.NewHabitHandler(habitService)
	sleepHandler := handlers.NewSleepHandler(sleepService)
	statsHandler := handlers.NewStatsHandler(statsService)
	adminHandler := handlers.NewAdminHandler(adminService)

	authMiddleware := middleware.NewAuthMiddleware(jwtManager)
	rateLimiter := middleware.NewRateLimiter(20, time.Minute)

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery(), CORSMiddleware(cfg.Server.CORSOrigin))

	router.GET("/api/health", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		databaseStatus := "ok"
		statusCode := http.StatusOK
		if err := db.PingContext(ctx); err != nil {
			databaseStatus = "error"
			statusCode = http.StatusServiceUnavailable
		}

		c.JSON(statusCode, gin.H{
			"status":      "ok",
			"database":    databaseStatus,
			"environment": cfg.AppEnv,
		})
	})

	auth := router.Group("/api/auth")
	{
		auth.POST("/register", rateLimiter.Middleware(), authHandler.Register)
		auth.POST("/login", rateLimiter.Middleware(), authHandler.Login)
		auth.GET("/me", authMiddleware.RequireAuth(), authHandler.Me)
		auth.PUT("/me", authMiddleware.RequireAuth(), authHandler.UpdateProfile)
		auth.PUT("/password", authMiddleware.RequireAuth(), authHandler.ChangePassword)
		auth.POST("/logout", authMiddleware.RequireAuth(), authHandler.Logout)
	}

	api := router.Group("/api")
	api.Use(authMiddleware.RequireAuth())
	{
		api.GET("/stats", statsHandler.Get)
		api.GET("/tasks", taskHandler.GetAll)
		api.POST("/tasks", taskHandler.Create)
		api.GET("/tasks/:id", taskHandler.GetByID)
		api.PUT("/tasks/:id", taskHandler.Update)
		api.DELETE("/tasks/:id", taskHandler.Delete)
		api.PATCH("/tasks/:id/toggle", taskHandler.Toggle)

		api.GET("/habits", habitHandler.GetAll)
		api.POST("/habits", habitHandler.Create)
		api.GET("/habits/:id", habitHandler.GetByID)
		api.PUT("/habits/:id", habitHandler.Update)
		api.DELETE("/habits/:id", habitHandler.Delete)
		api.PATCH("/habits/:id/check", habitHandler.Check)

		api.GET("/sleep/settings", sleepHandler.GetSettings)
		api.PUT("/sleep/settings", sleepHandler.UpdateSettings)
		api.GET("/sleep/logs", sleepHandler.GetLogs)
		api.POST("/sleep/logs", sleepHandler.CreateLog)
		api.PUT("/sleep/logs/:id", sleepHandler.UpdateLog)
		api.DELETE("/sleep/logs/:id", sleepHandler.DeleteLog)
		api.GET("/sleep/stats", sleepHandler.GetStats)
	}

	admin := router.Group("/api/admin")
	admin.Use(authMiddleware.RequireAuth(), authMiddleware.RequireAdmin())
	{
		admin.GET("/stats", adminHandler.Stats)
		admin.GET("/users", adminHandler.Users)
		admin.PATCH("/users/:id/role", adminHandler.UpdateUserRole)
	}

	return router
}

func CORSMiddleware(allowedOrigin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && IsAllowedOrigin(origin, allowedOrigin) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func IsAllowedOrigin(origin, configured string) bool {
	if configured != "" {
		for _, allowed := range strings.Split(configured, ",") {
			if strings.TrimSpace(allowed) == origin {
				return true
			}
		}
		return false
	}

	switch origin {
	case "null", "http://localhost:8080", "http://localhost:8082", "http://localhost:8090", "http://localhost:3000":
		return true
	default:
		return false
	}
}
