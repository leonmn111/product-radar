import "server-only";
import { z } from "zod";

// Server-side environment, validated once at startup so a missing or
// malformed variable fails loudly instead of surfacing as a vague DB error.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
      message: "must be a postgresql:// connection string",
    }),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables (see .env.example):\n${issues}`);
}

export const env = parsed.data;
