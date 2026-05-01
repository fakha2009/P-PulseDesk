package utils

import "testing"

func TestPasswordManagerHashVerify(t *testing.T) {
	manager := NewPasswordManager()

	hash, err := manager.Hash("StrongPass1!")
	if err != nil {
		t.Fatalf("Hash() returned error: %v", err)
	}

	if err := manager.Verify(hash, "StrongPass1!"); err != nil {
		t.Fatalf("Verify() should accept the original password: %v", err)
	}

	if err := manager.Verify(hash, "WrongPass1!"); err == nil {
		t.Fatal("Verify() should reject a different password")
	}
}

func TestPasswordManagerValidate(t *testing.T) {
	manager := NewPasswordManager()

	if err := manager.Validate("StrongPass1"); err != nil {
		t.Fatalf("Validate() rejected a strong password: %v", err)
	}

	weakPasswords := []string{
		"short1!",
		"lowercase1!",
		"UPPERCASE1!",
		"NoNumber!",
	}

	for _, password := range weakPasswords {
		if err := manager.Validate(password); err == nil {
			t.Fatalf("Validate() accepted weak password %q", password)
		}
	}
}

func TestValidateEmail(t *testing.T) {
	if err := ValidateEmail("user@example.com"); err != nil {
		t.Fatalf("ValidateEmail() rejected a valid email: %v", err)
	}

	if err := ValidateEmail("not-an-email"); err == nil {
		t.Fatal("ValidateEmail() accepted an invalid email")
	}
}
