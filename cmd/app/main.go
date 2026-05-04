package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"habitracker/app/config"
	"habitracker/app/database"
	"habitracker/app/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Connecting to PostgreSQL database using %s", cfg.Database.SourceLabel())

	db, err := database.New(cfg.Database.DSN())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Migrate(); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Database migrations completed")

	if err := db.Seed(); err != nil {
		log.Printf("Warning: Failed to seed database: %v", err)
	} else {
		log.Println("Database seeded successfully")
	}

	router := server.NewRouter(cfg, db)
	router.Static("/static", "./web")
	router.StaticFile("/styles.css", "./web/styles.css")
	router.StaticFile("/app.js", "./web/app.js")
	router.StaticFile("/auth.js", "./web/auth.js")
	router.StaticFile("/api-config.js", "./web/api-config.js")
	router.StaticFile("/favicon.svg", "./web/favicon.svg")
	router.StaticFile("/manifest.webmanifest", "./web/manifest.webmanifest")
	router.Static("/assets", "./web/assets")
	router.StaticFile("/config.js", "./web/config.js")
	router.StaticFile("/sw.js", "./web/sw.js")
	router.GET("/", func(c *gin.Context) {
		c.File("./web/auth.html")
	})
	router.GET("/auth", func(c *gin.Context) {
		c.File("./web/auth.html")
	})
	router.GET("/app", func(c *gin.Context) {
		c.File("./web/app.html")
	})
	for _, path := range []string{"/dashboard", "/tasks", "/calendar", "/habits", "/sleep", "/profile", "/library", "/proofs", "/admin"} {
		routePath := path
		router.GET(routePath, func(c *gin.Context) {
			c.File("./web/app.html")
		})
	}

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: router,
	}

	go func() {
		log.Printf("Server starting on http://localhost%s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
