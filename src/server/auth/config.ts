import "server-only";

/** Authentication policy. Changing these values changes security posture — review before editing. */
export const AUTH_POLICY = {
  /** Absolute session lifetime; the user must sign in again afterwards. */
  sessionMaxAgeSeconds: 7 * 24 * 60 * 60,
  /** Sessions unused for this long are rejected. */
  sessionIdleTimeoutSeconds: 12 * 60 * 60,
  /** Minimum interval between last-seen updates, to avoid a write on every request. */
  sessionTouchIntervalSeconds: 5 * 60,
  passwordResetTokenTtlSeconds: 30 * 60,
  password: { minLength: 12, maxLength: 128 },
  rateLimits: {
    loginPerEmail: { limit: 5, windowSeconds: 15 * 60 },
    loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
    resetRequestPerEmail: { limit: 3, windowSeconds: 60 * 60 },
    resetRequestPerIp: { limit: 10, windowSeconds: 60 * 60 },
    resetSubmitPerIp: { limit: 10, windowSeconds: 15 * 60 },
  },
} as const;
