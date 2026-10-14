import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Development transport: writes each message to .outbox/ (gitignored) instead of sending it. */
export class OutboxMailer implements Mailer {
  constructor(private readonly directory = ".outbox") {}

  async send(message: EmailMessage): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${stamp}-${randomBytes(3).toString("hex")}.json`;
    await writeFile(join(this.directory, name), JSON.stringify(message, null, 2), "utf8");
  }
}

/** Test transport: keeps messages in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

let mailer: Mailer | undefined;

export function getMailer(): Mailer {
  if (mailer) return mailer;
  if (env().EMAIL_TRANSPORT === "outbox") {
    mailer = new OutboxMailer();
    return mailer;
  }
  // A real provider arrives in Task 017. Fail loudly rather than silently dropping mail.
  throw new Error("No email provider is configured (EMAIL_TRANSPORT=disabled).");
}
