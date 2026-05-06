package migrations

import "embed"

//go:embed *.sql
var files embed.FS

type Migration struct {
	Version string
	Name    string
	SQL     string
}

func All() ([]Migration, error) {
	definitions := []struct {
		version string
		name    string
		file    string
	}{
		{"001", "initial", "001_initial.sql"},
		{"002", "proof_based_habits", "002_proof_based_habits.sql"},
		{"003", "user_preferences", "003_user_preferences.sql"},
		{"004", "user_sessions", "004_user_sessions.sql"},
		{"005", "library_pagination_indexes", "005_library_pagination_indexes.sql"},
	}

	result := make([]Migration, 0, len(definitions))
	for _, definition := range definitions {
		content, err := files.ReadFile(definition.file)
		if err != nil {
			return nil, err
		}
		result = append(result, Migration{
			Version: definition.version,
			Name:    definition.name,
			SQL:     string(content),
		})
	}
	return result, nil
}
