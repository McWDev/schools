import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

import { AUTH_POLICY } from "./config";

// OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1). 2 = Algorithm.Argon2id; the
// package exports a const enum, which isolatedModules cannot import.
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const { minLength, maxLength } = AUTH_POLICY.password;

/** Length-based policy (NIST SP 800-63B): no composition rules, long passphrases welcome. */
export const passwordSchema = z
  .string()
  .min(minLength, `Use at least ${minLength} characters.`)
  .max(maxLength, `Use at most ${maxLength} characters.`);

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Spend the same work as a real verification when the account does not exist, so response
 * timing does not reveal which email addresses are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalization");
  await verifyPassword(await dummyHash, password);
  return false;
}
