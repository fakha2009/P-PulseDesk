package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type RateLimiter struct {
	requests map[string][]time.Time
	mutex    sync.RWMutex
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (r *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		r.mutex.Lock()
		defer r.mutex.Unlock()

		now := time.Now()

		// Clean old requests
		if requests, exists := r.requests[clientIP]; exists {
			var validRequests []time.Time
			for _, reqTime := range requests {
				if now.Sub(reqTime) < r.window {
					validRequests = append(validRequests, reqTime)
				}
			}
			r.requests[clientIP] = validRequests
		}

		// Check if limit exceeded
		if len(r.requests[clientIP]) >= r.limit {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"error":   "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}

		// Add current request
		r.requests[clientIP] = append(r.requests[clientIP], now)

		c.Next()
	}
}

func (r *RateLimiter) String() string {
	return fmt.Sprintf("RateLimiter(limit=%d, window=%v)", r.limit, r.window)
}
