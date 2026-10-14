import "server-only";

/**
 * Raised when tenant context is missing, forged, or does not grant access. The message is
 * deliberately generic so it never reveals whether another school's record exists.
 */
export class TenantAccessError extends Error {
  constructor(reason = "Access denied") {
    super(reason);
    this.name = "TenantAccessError";
  }
}

/** A request that conflicts with existing data, e.g. inviting someone who is already a member. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Raised when the caller is inside a valid tenant but lacks the required scope. */
export class ForbiddenError extends Error {
  constructor(reason = "You do not have permission to perform this action") {
    super(reason);
    this.name = "ForbiddenError";
  }
}
