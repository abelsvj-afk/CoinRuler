import 'dotenv/config';
import { z } from 'zod';

// Central environment schema for required configuration.
// Optional values are marked accordingly; DRY_RUN defaults true for safety.
// OWNER_ID is optional (unlocks admin-protected endpoints & Discord commands).
// OPENAI_API_KEY optional (LLM features degrade gracefully if absent).
// WEB_ORIGIN / API_BASE purely for CORS & cross-service calls; have sensible fallbacks.

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI required'),
  DATABASE_NAME: z.string().min(1, 'DATABASE_NAME required'),
  // Discord token now optional: bot runs in disabled mode if absent
  DISCORD_BOT_TOKEN: z.string().optional(),
  // Coinbase keys now optional: if absent, integration runs in disabled mode
  COINBASE_API_KEY: z.string().optional(),
  COINBASE_API_SECRET: z.string().optional(),
  DRY_RUN: z.string().default('true'),
  OWNER_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  WEB_ORIGIN: z.string().optional(),
  NEXT_PUBLIC_WEB_ORIGIN: z.string().optional(),
  API_PORT: z.string().optional(),
  PORT: z.string().optional(),
  API_BASE: z.string().optional(),
  API_BASE_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { DRY_RUN: string };

let cached: Env | null = null;

export function validateEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    console.error('❌ Environment validation failed:\n' + issues);
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data as Env;
  // Hard safety: force DRY_RUN true unless explicitly set false AND OWNER_ID present
  if (cached.DRY_RUN !== 'false') {
    cached.DRY_RUN = 'true';
  } else if (!cached.OWNER_ID) {
    console.warn('⚠️ DRY_RUN cannot be disabled without OWNER_ID defined. Enforcing DRY_RUN= true');
    cached.DRY_RUN = 'true';
  }
  return cached;
}

export function isDryRun(): boolean {
  const env = validateEnv();
  return env.DRY_RUN === 'true';
}

export function requireOwner(authId?: string): boolean {
  const env = validateEnv();
  if (!env.OWNER_ID) return false; // owner enforcement active only if configured
  return authId === env.OWNER_ID;
}

export function getEnv(): Env {
  return validateEnv();
}

export function hasCoinbaseCredentials(): boolean {
  const env = validateEnv();
  return !!(env.COINBASE_API_KEY && env.COINBASE_API_SECRET);
}

export function hasDiscordToken(): boolean {
  const env = validateEnv();
  return !!env.DISCORD_BOT_TOKEN;
}
