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
		"INSERT INTO users (name, email, password_hash, role, theme, created_at, updated_at) VALUES ($1, $2, $3, 'user', 'dark', NOW(), NOW()) RETURNING id",
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
		"SELECT id, name, email, role, theme, created_at, updated_at FROM users WHERE id = $1",
		id,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) GetByEmail(email string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(
		"SELECT id, name, email, role, theme, password_hash, created_at, updated_at FROM users WHERE email = $1",
		email,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *UserRepository) GetWithPasswordByID(id int64) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(
		"SELECT id, name, email, role, theme, password_hash, created_at, updated_at FROM users WHERE id = $1",
		id,
	).Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.Theme, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)
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
	_, err := r.db.Exec(
		"UPDATE users SET theme = $1, updated_at = NOW() WHERE id = $2",
		theme, id,
	)
	if err != nil {
		return nil, err
	}

	return r.GetByID(id)
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
