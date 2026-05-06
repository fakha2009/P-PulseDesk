package middleware

import "github.com/gin-gonic/gin"

func SecurityHeaders() gin.HandlerFunc {
	const csp = "" +
		"default-src 'self'; " +
		"script-src 'self' 'unsafe-inline'; " +
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
		"img-src 'self' data: blob:; " +
		"media-src 'self' blob: data:; " +
		"connect-src 'self' https://*.supabase.co https://*.vercel.app http://localhost:* http://127.0.0.1:*; " +
		"font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
		"object-src 'none'; " +
		"base-uri 'self'; " +
		"frame-ancestors 'none'"

	return func(c *gin.Context) {
		header := c.Writer.Header()
		header.Set("Content-Security-Policy", csp)
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		header.Set("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
		header.Set("X-Frame-Options", "DENY")
		c.Next()
	}
}
