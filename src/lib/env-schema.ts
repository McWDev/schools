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
});

export type ServerEnv = Omit<z.infer<typeof serverEnvSchema>, "EMAIL_TRANSPORT"> & {
  EMAIL_TRANSPORT: "outbox" | "disabled";
};

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only — never echo values, which may be secrets.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }
  const data = result.data;
  return {
    ...data,
    EMAIL_TRANSPORT:
      data.EMAIL_TRANSPORT ?? (data.NODE_ENV === "production" ? "disabled" : "outbox"),
  };
}
