/**
 * Simple IP-based rate limiter to prevent joinGame spam
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitRecord> = new Map();
  private windowMs: number;
  private maxRequests: number;

  /**
   * Create a new rate limiter
   * @param windowMs Time window in milliseconds
   * @param maxRequests Maximum requests allowed per window
   */
  constructor(windowMs = 60000, maxRequests = 5) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up expired records periodically
    setInterval(() => this.cleanup(), windowMs);
  }

  /**
   * Check if a request is allowed
   * @param ip The IP address to check
   * @returns true if the request is allowed, false otherwise
   */
  isAllowed(ip: string): boolean {
    const now = Date.now();
    
    // Get or create a record for this IP
    let record = this.limits.get(ip);
    
    if (!record) {
      record = { count: 0, resetTime: now + this.windowMs };
      this.limits.set(ip, record);
    }

    // Reset count if the window has expired
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + this.windowMs;
    }

    // Increment count
    record.count++;

    // Allow if under limit
    return record.count <= this.maxRequests;
  }

  /**
   * Clean up expired records
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Remove expired records
    for (const [ip, record] of this.limits.entries()) {
      if (now > record.resetTime) {
        this.limits.delete(ip);
      }
    }
  }
}
