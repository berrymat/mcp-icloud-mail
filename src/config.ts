import { z } from "zod";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const ruleSchema = z.object({
  description: z.string().optional(),
  senders: z.array(z.string()).default([]),
  markAsRead: z.boolean().default(false),
});

const configSchema = z.object({
  rules: z.object({
    delete: ruleSchema.default({ senders: [] }),
    junk: ruleSchema.default({ senders: [] }),
    keepLatest: ruleSchema.default({ senders: [] }),
  }).default({}),
});

export type RuleConfig = z.infer<typeof ruleSchema>;
export type Config = z.infer<typeof configSchema>;

export async function loadConfig(): Promise<Config> {
  const configPath = process.env.MCP_MAIL_CONFIG
    ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.json");

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return configSchema.parse({});
    }
    throw err;
  }

  return configSchema.parse(JSON.parse(raw));
}
