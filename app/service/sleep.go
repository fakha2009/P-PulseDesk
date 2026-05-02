package service

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"habitracker/app/models"
	"habitracker/app/repository"
)

var (
	ErrSleepNotFound   = errors.New("sleep record not found")
	ErrInvalidSleepLog = errors.New("invalid sleep log")
)

const (
	defaultBedTime      = "23:00:00"
	defaultWakeTime     = "07:00:00"
	complianceTolerance = 45
	durationTolerance   = 30
)

type SleepService struct {
	repo *repository.SleepRepository
}

func NewSleepService(repo *repository.SleepRepository) *SleepService {
	return &SleepService{repo: repo}
}

func (s *SleepService) GetSettings(userID int64) (*models.SleepSettings, error) {
	settings, err := s.repo.GetSettings(userID)
	if errors.Is(err, sql.ErrNoRows) {
		return s.repo.UpsertSettings(userID, defaultBedTime, defaultWakeTime)
	}
	if err != nil {
		return nil, err
	}
	return settings, nil
}

func (s *SleepService) UpdateSettings(userID int64, req models.SleepSettingsUpdate) (*models.SleepSettings, error) {
	bedTime, err := normalizeClock(req.TargetBedTime)
	if err != nil {
		return nil, fmt.Errorf("target_bed_time must be HH:MM or HH:MM:SS")
	}
	wakeTime, err := normalizeClock(req.TargetWakeTime)
	if err != nil {
		return nil, fmt.Errorf("target_wake_time must be HH:MM or HH:MM:SS")
	}
	if bedTime == wakeTime {
		return nil, fmt.Errorf("target bed time and wake time cannot be equal")
	}

	return s.repo.UpsertSettings(userID, bedTime, wakeTime)
}

func (s *SleepService) GetLogs(userID int64) ([]models.SleepLog, error) {
	return s.repo.GetLogs(userID)
}

func (s *SleepService) CreateLog(userID int64, req models.SleepLogCreate) (*models.SleepLog, error) {
	log, err := buildSleepLog(userID, 0, req.SleepDate, req.BedTime, req.WakeTime, req.Quality, req.Note)
	if err != nil {
		return nil, err
	}
	return s.repo.UpsertLog(*log)
}

func (s *SleepService) UpdateLog(userID, id int64, req models.SleepLogUpdate) (*models.SleepLog, error) {
	if _, err := s.repo.GetByID(userID, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrSleepNotFound
		}
		return nil, err
	}

	log, err := buildSleepLog(userID, id, req.SleepDate, req.BedTime, req.WakeTime, req.Quality, req.Note)
	if err != nil {
		return nil, err
	}
	return s.repo.UpdateLog(*log)
}

func (s *SleepService) DeleteLog(userID, id int64) error {
	if err := s.repo.DeleteLog(userID, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrSleepNotFound
		}
		return err
	}
	return nil
}

func (s *SleepService) GetStats(userID int64) (*models.SleepStats, error) {
	settings, err := s.GetSettings(userID)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	week, err := s.repo.GetWeeklyLogs(userID, now)
	if err != nil {
		return nil, err
	}

	targetDuration, err := calculateTargetDuration(settings.TargetBedTime, settings.TargetWakeTime)
	if err != nil {
		return nil, err
	}

	stats := &models.SleepStats{
		TargetDurationMinutes: targetDuration,
		DaysLogged:            len(week),
		Week:                  week,
		Settings:              *settings,
		Status:                "empty",
		Recommendation:        "Добавьте первую запись сна, чтобы увидеть рекомендации.",
	}

	if today, err := s.repo.GetTodayLog(userID, now); err == nil {
		stats.Today = today
	} else if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	if len(week) == 0 {
		return stats, nil
	}

	total := 0
	for i := range week {
		log := week[i]
		total += log.DurationMinutes

		if stats.BestDay == nil || log.DurationMinutes > stats.BestDay.DurationMinutes {
			copy := log
			stats.BestDay = &copy
		}
		if stats.WorstDay == nil || log.DurationMinutes < stats.WorstDay.DurationMinutes {
			copy := log
			stats.WorstDay = &copy
		}
		if sleepLogCompliant(log, *settings, targetDuration) {
			stats.CompliantDays++
		}
	}

	stats.AverageDurationMinutes = total / len(week)
	stats.Status = string(calculateSleepQuality(stats.AverageDurationMinutes))
	stats.Recommendation = buildSleepRecommendation(stats, targetDuration)

	return stats, nil
}

func buildSleepLog(userID, id int64, sleepDate, bedTimeValue, wakeTimeValue, qualityValue, note string) (*models.SleepLog, error) {
	bedTime, err := parseDateTime(bedTimeValue)
	if err != nil {
		return nil, fmt.Errorf("%w: bed_time must be a valid datetime", ErrInvalidSleepLog)
	}
	wakeTime, err := parseDateTime(wakeTimeValue)
	if err != nil {
		return nil, fmt.Errorf("%w: wake_time must be a valid datetime", ErrInvalidSleepLog)
	}
	if wakeTime.Before(bedTime) {
		wakeTime = wakeTime.Add(24 * time.Hour)
	}
	if !wakeTime.After(bedTime) {
		return nil, fmt.Errorf("%w: wake_time must be after bed_time", ErrInvalidSleepLog)
	}

	duration := calculateSleepDuration(bedTime, wakeTime)
	if duration <= 0 || duration > 24*60 {
		return nil, fmt.Errorf("%w: duration must be between 1 minute and 24 hours", ErrInvalidSleepLog)
	}

	normalizedDate := strings.TrimSpace(sleepDate)
	if normalizedDate == "" {
		normalizedDate = bedTime.Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", normalizedDate); err != nil {
		return nil, fmt.Errorf("%w: sleep_date must be YYYY-MM-DD", ErrInvalidSleepLog)
	}

	quality := calculateSleepQuality(duration)
	switch strings.TrimSpace(qualityValue) {
	case "", "auto":
	case "poor":
		quality = models.SleepQualityPoor
	case "normal", "good":
		quality = models.SleepQualityNormal
	case "great", "excellent":
		quality = models.SleepQualityGreat
	default:
		return nil, fmt.Errorf("%w: quality must be poor, normal, good, great or excellent", ErrInvalidSleepLog)
	}

	return &models.SleepLog{
		ID:              id,
		UserID:          userID,
		SleepDate:       normalizedDate,
		BedTime:         bedTime,
		WakeTime:        wakeTime,
		DurationMinutes: duration,
		Quality:         quality,
		Note:            strings.TrimSpace(note),
	}, nil
}

func parseDateTime(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, fmt.Errorf("datetime is required")
	}

	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}

	var lastErr error
	for _, layout := range layouts {
		var parsed time.Time
		var err error
		if layout == time.RFC3339 {
			parsed, err = time.Parse(layout, value)
		} else {
			parsed, err = time.ParseInLocation(layout, value, time.Local)
		}
		if err == nil {
			return parsed, nil
		}
		lastErr = err
	}
	return time.Time{}, lastErr
}

func normalizeClock(value string) (string, error) {
	value = strings.TrimSpace(value)
	layouts := []string{"15:04:05", "15:04"}
	for _, layout := range layouts {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed.Format("15:04:05"), nil
		}
	}
	return "", fmt.Errorf("invalid clock")
}

func calculateSleepDuration(bedTime, wakeTime time.Time) int {
	return int(wakeTime.Sub(bedTime).Minutes())
}

func calculateSleepQuality(durationMinutes int) models.SleepQuality {
	switch {
	case durationMinutes < 6*60:
		return models.SleepQualityPoor
	case durationMinutes >= 8*60 && durationMinutes <= 9*60:
		return models.SleepQualityGreat
	default:
		return models.SleepQualityNormal
	}
}

func calculateTargetDuration(targetBedTime, targetWakeTime string) (int, error) {
	bed, err := time.Parse("15:04:05", targetBedTime)
	if err != nil {
		return 0, err
	}
	wake, err := time.Parse("15:04:05", targetWakeTime)
	if err != nil {
		return 0, err
	}
	if !wake.After(bed) {
		wake = wake.Add(24 * time.Hour)
	}
	return int(wake.Sub(bed).Minutes()), nil
}

func sleepLogCompliant(log models.SleepLog, settings models.SleepSettings, targetDuration int) bool {
	bedDiff := clockMinuteDistance(minutesOfDay(log.BedTime), mustClockMinutes(settings.TargetBedTime))
	wakeDiff := clockMinuteDistance(minutesOfDay(log.WakeTime), mustClockMinutes(settings.TargetWakeTime))
	return bedDiff <= complianceTolerance &&
		wakeDiff <= complianceTolerance &&
		log.DurationMinutes >= targetDuration-durationTolerance
}

func buildSleepRecommendation(stats *models.SleepStats, targetDuration int) string {
	switch {
	case stats.AverageDurationMinutes < 6*60:
		return "Недосып за неделю. Сегодня лучше лечь раньше."
	case stats.AverageDurationMinutes < targetDuration-durationTolerance:
		return "Сегодня лучше лечь раньше, чтобы вернуться к целевому режиму."
	case stats.CompliantDays >= 5:
		return "Режим стабильный. Сохраняйте текущий график."
	case stats.Today != nil && stats.Today.Quality == models.SleepQualityPoor:
		return "Сегодня лучше лечь раньше: последняя ночь была короткой."
	default:
		return "Режим почти стабилен. Держите одинаковое время сна и подъема."
	}
}

func minutesOfDay(value time.Time) int {
	local := value.In(time.Local)
	return local.Hour()*60 + local.Minute()
}

func mustClockMinutes(value string) int {
	parsed, err := time.Parse("15:04:05", value)
	if err != nil {
		return 0
	}
	return parsed.Hour()*60 + parsed.Minute()
}

func clockMinuteDistance(a, b int) int {
	diff := a - b
	if diff < 0 {
		diff = -diff
	}
	if diff > 12*60 {
		return 24*60 - diff
	}
	return diff
}
