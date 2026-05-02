package repository

import (
	"database/sql"

	"habitracker/app/models"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(name, email, passwordHash string) (*models.User, error) {
	var id int64
	err := r.db.QueryRow(
		"INSERT INTO users (name, email, password_hash, role, theme, disabled, created_at, updated_at) VALUES ($1, $2, $3, 'user', 'dark', FALSE, NOW(), NOW()) RETURNING id",
		name, email, passwordHash,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	return r.GetByID(id)
}

func (r *UserRepository) GetByID(id int64) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(
		"SELECT id, name, email, role, theme, disabled, created_at, updated_at FROM users WHERE id = $1",
		id,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.Disabled, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) GetByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(
		"SELECT id, name, email, role, theme, disabled, password_hash, created_at, updated_at FROM users WHERE email = $1",
		email,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.Disabled, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) GetWithPasswordByID(id int64) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(
		"SELECT id, name, email, role, theme, disabled, password_hash, created_at, updated_at FROM users WHERE id = $1",
		id,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.Disabled, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) Update(id int64, name string) (*models.User, error) {
	_, err := r.db.Exec(
		"UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2",
		name, id,
	)
	if err != nil {
		return nil, err
	}

	return r.GetByID(id)
}

func (r *UserRepository) UpdatePassword(id int64, passwordHash string) error {
	_, err := r.db.Exec(
		"UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
		passwordHash, id,
	)
	return err
}

func (r *UserRepository) UpdateTheme(id int64, theme string) (*models.User, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.Exec("UPDATE users SET theme = $1, updated_at = NOW() WHERE id = $2", theme, id)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(`
		INSERT INTO user_preferences (user_id, theme, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET theme = EXCLUDED.theme, updated_at = NOW()
	`, id, theme)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return r.GetByID(id)
}

func (r *UserRepository) GetPreferences(userID int64) (*models.UserPreferences, error) {
	var prefs models.UserPreferences
	err := r.db.QueryRow(`
		INSERT INTO user_preferences (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING
		RETURNING user_id, theme, accent, density, motion, background_glow, updated_at
	`, userID).Scan(&prefs.UserID, &prefs.Theme, &prefs.Accent, &prefs.Density, &prefs.Motion, &prefs.BackgroundGlow, &prefs.UpdatedAt)
	if err == nil {
		return &prefs, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}

	err = r.db.QueryRow(`
		SELECT user_id, theme, accent, density, motion, background_glow, updated_at
		FROM user_preferences
		WHERE user_id = $1
	`, userID).Scan(&prefs.UserID, &prefs.Theme, &prefs.Accent, &prefs.Density, &prefs.Motion, &prefs.BackgroundGlow, &prefs.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &prefs, nil
}

func (r *UserRepository) UpdatePreferences(userID int64, prefs models.UserPreferencesUpdate) (*models.UserPreferences, error) {
	current, err := r.GetPreferences(userID)
	if err != nil {
		return nil, err
	}

	theme := current.Theme
	accent := current.Accent
	density := current.Density
	motion := current.Motion
	backgroundGlow := current.BackgroundGlow
	if prefs.Theme != "" {
		theme = prefs.Theme
	}
	if prefs.Accent != "" {
		accent = prefs.Accent
	}
	if prefs.Density != "" {
		density = prefs.Density
	}
	if prefs.Motion != "" {
		motion = prefs.Motion
	}
	if prefs.BackgroundGlow != nil {
		backgroundGlow = *prefs.BackgroundGlow
	}

	var updated models.UserPreferences
	err = r.db.QueryRow(`
		INSERT INTO user_preferences (user_id, theme, accent, density, motion, background_glow, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET theme = EXCLUDED.theme,
			accent = EXCLUDED.accent,
			density = EXCLUDED.density,
			motion = EXCLUDED.motion,
			background_glow = EXCLUDED.background_glow,
			updated_at = NOW()
		RETURNING user_id, theme, accent, density, motion, background_glow, updated_at
	`, userID, theme, accent, density, motion, backgroundGlow).Scan(
		&updated.UserID, &updated.Theme, &updated.Accent, &updated.Density, &updated.Motion, &updated.BackgroundGlow, &updated.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if theme == "light" || theme == "dark" {
		_, _ = r.db.Exec("UPDATE users SET theme = $1, updated_at = NOW() WHERE id = $2", theme, userID)
	}

	return &updated, nil
}

func (r *UserRepository) Delete(id int64) error {
	_, err := r.db.Exec("DELETE FROM users WHERE id = $1", id)
	return err
}

func (r *UserRepository) Exists(email string) (bool, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM users WHERE email = $1", email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}
