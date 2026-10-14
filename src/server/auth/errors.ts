import "server-only";

/** User-correctable input problem; the message is safe to show. */
export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthValidationError";
  }
}
