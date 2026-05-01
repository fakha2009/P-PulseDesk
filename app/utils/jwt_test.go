package utils

import (
	"testing"
)

func TestJWTManagerGenerateVerify(t *testing.T) {
	manager := NewJWTManager("01234567890123456789012345678901")

	token, err := manager.Generate(42, "user@example.com", "admin")
	if err != nil {
		t.Fatalf("Generate() returned error: %v", err)
	}

	claims, err := manager.Verify(token)
	if err != nil {
		t.Fatalf("Verify() returned error: %v", err)
	}

	if claims.UserID != 42 {
		t.Fatalf("UserID = %d, want 42", claims.UserID)
	}
	if claims.Email != "user@example.com" {
		t.Fatalf("Email = %q, want user@example.com", claims.Email)
	}
	if claims.Role != "admin" {
		t.Fatalf("Role = %q, want admin", claims.Role)
	}
}

func TestJWTManagerRejectsInvalidToken(t *testing.T) {
	manager := NewJWTManager("01234567890123456789012345678901")

	if _, err := manager.Verify("not-a-token"); err == nil {
		t.Fatal("Verify() accepted an invalid token")
	}
}
