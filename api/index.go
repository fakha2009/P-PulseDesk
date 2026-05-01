package handler

import (
	"log"
	"net/http"
	"sync"

	"habitracker/app/config"
	"habitracker/app/database"
	"habitracker/app/server"
)

var (
	initOnce sync.Once
	app      http.Handler
	initErr  error
)

func Handler(w http.ResponseWriter, r *http.Request) {
	initOnce.Do(func() {
		cfg, err := config.Load()
		if err != nil {
			initErr = err
			return
		}

		log.Printf("Connecting to PostgreSQL database using %s", cfg.Database.SourceLabel())
		db, err := database.New(cfg.Database.DSN())
		if err != nil {
			initErr = err
			return
		}

		if err := db.Migrate(); err != nil {
			initErr = err
			return
		}
		if err := db.Seed(); err != nil {
			log.Printf("Warning: Failed to seed database: %v", err)
		}

		app = server.NewRouter(cfg, db)
	})

	if initErr != nil {
		http.Error(w, "server initialization failed", http.StatusInternalServerError)
		return
	}
	app.ServeHTTP(w, r)
}
