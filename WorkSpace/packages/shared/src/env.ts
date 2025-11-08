import 'dotenv/config';
import { z } from 'zod';

// Central environment schema for required configuration.
// Optional values are marked accordingly; DRY_RUN defaults true for safety.
// OWNER_ID is optional (unlocks admin-protected endpoints & Discord commands).
// OPENAI_API_KEY optional (LLM features degrade gracefully if absent).
// WEB_ORIGIN / API_BASE purely for CORS & cross-service calls; have sensible fallbacks.

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  // Make Mongo optional so API can start in degraded mode (will retry / warn)
  MONGODB_URI: z.string().optional(),
  // Provide default database name to prevent hard failure when unset
  DATABASE_NAME: z.string().default('coinruler'),
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
  // Auto-exec & risk controls (optional, with safe defaults)
  AUTO_EXECUTE_ENABLED: z.string().optional(),
  AUTO_EXECUTE_MAX_PER_TICK: z.string().optional(),
  AUTO_EXECUTE_RISK_MAX_TRADES_HOUR: z.string().optional(),
  AUTO_EXECUTE_DAILY_LOSS_LIMIT: z.string().optional(),
  MAX_SLIPPAGE_PCT: z.string().optional(),
  SNAPSHOT_INTERVAL_MINUTES: z.string().optional(),
  BACKTEST_SCHED_ENABLED: z.string().optional(),
  BACKTEST_SCHED_HOURS: z.string().optional(),
  BACKTEST_LOOKBACK_DAYS: z.string().optional(),
  BACKTEST_AUTOTUNE_ENABLED: z.string().optional(),
  ROTATION_SCHEDULER_ENABLED: z.string().optional(),
  CORS_FALLBACK_ALLOW: z.string().optional(),
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
  // Backfill defaults if omitted
  if (!cached.MONGODB_URI) {
    // Use local fallback; in production this will simply fail to connect and run degraded
    cached.MONGODB_URI = 'mongodb://localhost:27017';
  }
  // Hard safety: force DRY_RUN true unless explicitly set false AND OWNER_ID present
  if (cached.DRY_RUN !== 'false') {
    cached.DRY_RUN = 'true';
  } else if (!cached.OWNER_ID) {
    console.warn('⚠️ DRY_RUN cannot be disabled without OWNER_ID defined. Enforcing DRY_RUN= true');
    cached.DRY_RUN = 'true';
  }
  // Provide default strings for optional risk knobs (used via process.env reads elsewhere)
  process.env.AUTO_EXECUTE_ENABLED = process.env.AUTO_EXECUTE_ENABLED ?? 'false';
  process.env.AUTO_EXECUTE_MAX_PER_TICK = process.env.AUTO_EXECUTE_MAX_PER_TICK ?? '1';
  process.env.AUTO_EXECUTE_RISK_MAX_TRADES_HOUR = process.env.AUTO_EXECUTE_RISK_MAX_TRADES_HOUR ?? '4';
  process.env.AUTO_EXECUTE_DAILY_LOSS_LIMIT = process.env.AUTO_EXECUTE_DAILY_LOSS_LIMIT ?? '-1000';
  process.env.MAX_SLIPPAGE_PCT = process.env.MAX_SLIPPAGE_PCT ?? '0.02';
  process.env.SNAPSHOT_INTERVAL_MINUTES = process.env.SNAPSHOT_INTERVAL_MINUTES ?? '60';
  process.env.BACKTEST_SCHED_ENABLED = process.env.BACKTEST_SCHED_ENABLED ?? 'true';
  process.env.BACKTEST_SCHED_HOURS = process.env.BACKTEST_SCHED_HOURS ?? '24';
  process.env.BACKTEST_LOOKBACK_DAYS = process.env.BACKTEST_LOOKBACK_DAYS ?? '30';
  process.env.BACKTEST_AUTOTUNE_ENABLED = process.env.BACKTEST_AUTOTUNE_ENABLED ?? 'true';
  process.env.ROTATION_SCHEDULER_ENABLED = process.env.ROTATION_SCHEDULER_ENABLED ?? 'true';
  process.env.CORS_FALLBACK_ALLOW = process.env.CORS_FALLBACK_ALLOW ?? 'mycoinruler.xyz';
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
