package repository

import (
	"database/sql"
	"time"

	"habitracker/app/models"
)

type ProofRepository struct {
	db *sql.DB
}

func NewProofRepository(db *sql.DB) *ProofRepository {
	return &ProofRepository{db: db}
}

type ProofFilter struct {
	UserID   int64
	Page     int
	Limit    int
	Type     string
	DateFrom *time.Time
	DateTo   *time.Time
}

func (r *ProofRepository) List(filter ProofFilter) (*models.ProofLibraryResponse, error) {
	page := filter.Page
	if page < 1 {
		page = 1
	}
	limit := filter.Limit
	if limit < 1 || limit > 60 {
		limit = 24
	}

	where := "WHERE hp.user_id = $1 AND hp.file_url IS NOT NULL AND hp.file_url <> ''"
	args := []interface{}{filter.UserID}
	if filter.Type == "photo" || filter.Type == "audio" {
		args = append(args, filter.Type)
		where += " AND hp.type = " + placeholder(len(args))
	}
	if filter.DateFrom != nil {
		args = append(args, *filter.DateFrom)
		where += " AND hp.completion_date >= " + placeholder(len(args))
	}
	if filter.DateTo != nil {
		args = append(args, *filter.DateTo)
		where += " AND hp.completion_date <= " + placeholder(len(args))
	}

	var total int
	countQuery := `
		SELECT COUNT(*)
		FROM habit_proofs hp
		JOIN habits h ON h.id = hp.habit_id AND h.user_id = hp.user_id
	` + where
	if err := r.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, err
	}

	offset := (page - 1) * limit
	queryArgs := append([]interface{}{}, args...)
	queryArgs = append(queryArgs, limit, offset)
	query := `
		SELECT hp.id, hp.habit_id, h.title, hp.type, hp.file_url, COALESCE(hp.file_name, ''),
			COALESCE(hp.mime_type, ''), COALESCE(hp.file_size, 0), hp.completion_date, hp.created_at
		FROM habit_proofs hp
		JOIN habits h ON h.id = hp.habit_id AND h.user_id = hp.user_id
	` + where + `
		ORDER BY hp.completion_date DESC, hp.created_at DESC
		LIMIT ` + placeholder(len(queryArgs)-1) + ` OFFSET ` + placeholder(len(queryArgs))

	rows, err := r.db.Query(query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.ProofLibraryItem, 0)
	for rows.Next() {
		var item models.ProofLibraryItem
		if err := rows.Scan(
			&item.ID, &item.HabitID, &item.HabitTitle, &item.Type, &item.FileURL, &item.FileName,
			&item.MimeType, &item.FileSize, &item.CompletionDate, &item.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &models.ProofLibraryResponse{Items: items, Page: page, Limit: limit, Total: total}, nil
}

func (r *ProofRepository) Get(userID, proofID int64) (*models.HabitProof, error) {
	var proof models.HabitProof
	err := r.db.QueryRow(
		`SELECT id, habit_id, user_id, completion_date, type, COALESCE(text_note, ''), COALESCE(file_url, ''),
			COALESCE(file_name, ''), COALESCE(mime_type, ''), COALESCE(file_size, 0), created_at, updated_at
		 FROM habit_proofs
		 WHERE id = $1 AND user_id = $2`,
		proofID, userID,
	).Scan(
		&proof.ID, &proof.HabitID, &proof.UserID, &proof.CompletionDate, &proof.Type, &proof.TextNote,
		&proof.FileURL, &proof.FileName, &proof.MimeType, &proof.FileSize, &proof.CreatedAt, &proof.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &proof, nil
}

func (r *ProofRepository) Delete(userID, proofID int64) error {
	result, err := r.db.Exec("DELETE FROM habit_proofs WHERE id = $1 AND user_id = $2", proofID, userID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}
