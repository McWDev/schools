import "server-only";

/**
 * Raised when the access context is missing, forged, or the account is not active. The message
 * is deliberately generic so it never reveals whether a record exists.
 */
export class AccessDeniedError extends Error {
  constructor(reason = "Access denied") {
    super(reason);
    this.name = "AccessDeniedError";
  }
}

/** A request that conflicts with existing data, e.g. inviting someone who already has an account. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Raised when the user is signed in but lacks the permission or branch scope required. */
export class ForbiddenError extends Error {
  constructor(reason = "You do not have permission to perform this action") {
    super(reason);
    this.name = "ForbiddenError";
  }
}
