package service

import (
	"testing"
	"time"

	"habitracker/app/models"
)

func TestBuildSleepLogAddsNextDayWhenWakeBeforeBed(t *testing.T) {
	log, err := buildSleepLog(1, 0, "2026-04-30", "2026-04-30T23:30", "2026-04-30T07:00", "")
	if err != nil {
		t.Fatalf("buildSleepLog returned error: %v", err)
	}

	if log.DurationMinutes != 450 {
		t.Fatalf("duration = %d, want 450", log.DurationMinutes)
	}
	if !log.WakeTime.After(log.BedTime) {
		t.Fatalf("wake time should be after bed time")
	}
	if log.Quality != models.SleepQualityNormal {
		t.Fatalf("quality = %s, want normal", log.Quality)
	}
}

func TestCalculateSleepQuality(t *testing.T) {
	tests := []struct {
		name     string
		minutes  int
		expected models.SleepQuality
	}{
		{"poor below six hours", 359, models.SleepQualityPoor},
		{"normal at six hours", 360, models.SleepQualityNormal},
		{"great at eight hours", 480, models.SleepQualityGreat},
		{"great at nine hours", 540, models.SleepQualityGreat},
		{"normal above nine hours", 541, models.SleepQualityNormal},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := calculateSleepQuality(tt.minutes); got != tt.expected {
				t.Fatalf("calculateSleepQuality(%d) = %s, want %s", tt.minutes, got, tt.expected)
			}
		})
	}
}

func TestCalculateTargetDurationAcrossMidnight(t *testing.T) {
	duration, err := calculateTargetDuration("23:00:00", "07:00:00")
	if err != nil {
		t.Fatalf("calculateTargetDuration returned error: %v", err)
	}
	if duration != 480 {
		t.Fatalf("duration = %d, want 480", duration)
	}
}

func TestSleepLogCompliant(t *testing.T) {
	bed, _ := time.ParseInLocation("2006-01-02 15:04:05", "2026-04-30 23:20:00", time.Local)
	wake, _ := time.ParseInLocation("2006-01-02 15:04:05", "2026-05-01 07:10:00", time.Local)

	log := models.SleepLog{
		BedTime:         bed,
		WakeTime:        wake,
		DurationMinutes: 470,
	}
	settings := models.SleepSettings{
		TargetBedTime:  "23:00:00",
		TargetWakeTime: "07:00:00",
	}

	if !sleepLogCompliant(log, settings, 480) {
		t.Fatalf("log should be compliant")
	}
}
