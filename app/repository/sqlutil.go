package repository

import "fmt"

func placeholder(index int) string {
	return fmt.Sprintf("$%d", index)
}
