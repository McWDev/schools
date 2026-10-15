import { z } from "zod";

const postgresUrl = z
  .string()
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL");

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: postgresUrl,
  MIGRATION_DATABASE_URL: postgresUrl.optional(),
  APP_URL: z.string().url().default("http://localhost:3217"),
  /** "outbox" writes emails to .outbox/ for local use. Defaults to "disabled" in production. */
  EMAIL_TRANSPORT: z.enum(["outbox", "disabled"]).optional(),
  /** "local" stores uploads under .storage/. Defaults to "disabled" in production. */
  STORAGE_DRIVER: z.enum(["local", "disabled"]).optional(),
  /** Folder for the "local" driver. End-to-end tests use their own so they never wipe dev uploads. */
  STORAGE_DIR: z.string().min(1).default(".storage"),
});

type ParsedEnv = z.infer<typeof serverEnvSchema>;

export type ServerEnv = Omit<ParsedEnv, "EMAIL_TRANSPORT" | "STORAGE_DRIVER"> & {
  EMAIL_TRANSPORT: "outbox" | "disabled";
  STORAGE_DRIVER: "local" | "disabled";
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only — never echo values, which may be secrets.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }
  const data = result.data;
  // Local-only drivers must be opted into explicitly in production.
  const production = data.NODE_ENV === "production";
  return {
    ...data,
    EMAIL_TRANSPORT: data.EMAIL_TRANSPORT ?? (production ? "disabled" : "outbox"),
    STORAGE_DRIVER: data.STORAGE_DRIVER ?? (production ? "disabled" : "local"),
  };
}
