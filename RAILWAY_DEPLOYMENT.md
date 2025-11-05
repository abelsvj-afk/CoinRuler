# Railway Deployment Guide

## Quick Setup

### 1. Add Environment Variables in Railway

Go to your Railway project → **Variables** tab and add these:

**Required Variables:**
```
DISCORD_BOT_TOKEN=your_discord_bot_token_here
MONGODB_URI=your_mongodb_connection_string_here
DATABASE_NAME=cryptoAdvisorUltimate
OWNER_ID=your_discord_user_id_here
API_BASE_URL=http://localhost:3001
```

**Recommended Variables:**
```
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo
DRY_RUN=true
ROTATION_SCHEDULER_ENABLED=true
```

### Web Dashboard (optional, owner-only)

If you want a simple private web UI instead of Discord, add these too:

```
WEB_USERNAME=choose_a_username
WEB_PASSWORD=choose_a_strong_password
# For the web app to reach the API:
API_BASE=https://<your-railway-api-service-url>
# Or client-side fallback during local dev
NEXT_PUBLIC_API_BASE=http://localhost:3001
```

Then create a separate Railway service for the web app pointing to `WorkSpace/apps/web`:

1. Add a new service → Deploy from GitHub → pick this repo
2. In Service Settings, set the root directory to `WorkSpace/apps/web`
3. Build command: `npm install && npm run build`
4. Start command: `npm run start`
5. Add the web variables above in this service

### 2. Deploy

Railway will automatically:
1. Build the WorkSpace TypeScript code
2. Start the bot from `WorkSpace/apps/bot`
3. Connect to your Discord server
4. Register slash commands

### 3. Verify Deployment

Check Railway logs for:
```
Bot logged in as CoinRuler#6259
Bot is in 1 server(s):
  - ASCEND's server
✅ Slash commands registered!
```

## Deployment Configuration

### Files Used:
- `railway.json` - Build and deploy configuration
- `Procfile` - Process definitions (bot + api)
- `package.json` - Start scripts

### Build Process:
```bash
cd WorkSpace
npm install
npm run build  # Compiles TypeScript
```

### Start Process:
```bash
cd WorkSpace/apps/bot
node dist/index.js  # Runs compiled bot
```

## Troubleshooting

### "Missing DISCORD_BOT_TOKEN" Error
→ Add `DISCORD_BOT_TOKEN` in Railway Variables tab

### Bot not connecting to Discord
→ Verify `DISCORD_BOT_TOKEN` is correct
→ Check bot has proper intents enabled in Discord Developer Portal

### Commands not showing up
→ Bot registers guild-specific commands automatically on startup
→ Commands should appear immediately in your Discord server

### MongoDB connection issues
→ Verify `MONGODB_URI` is correct
→ Check MongoDB Atlas allows Railway IPs (or set to allow all)

## Manual Command Registration

If commands don't auto-register, run manually:

```bash
# In Railway shell or locally
cd WorkSpace/apps/bot
node register-commands.js
```

## Local Development

To test locally before Railway deployment:

```bash
# Copy environment variables (PowerShell)
Copy-Item .env WorkSpace/apps/bot/.env -Force

# Build monorepo
cd WorkSpace
npm install
npm run build

# Run bot
cd apps/bot
npm run dev

# (Optional) Run the web dashboard locally (PowerShell)
cd ../../apps/web
$env:WEB_USERNAME="owner"; $env:WEB_PASSWORD="pass"; $env:NEXT_PUBLIC_API_BASE="http://localhost:3001"; npm run dev
```

## Environment Variables Reference

See `.env.railway` for complete list of available environment variables.

## Support

If deployment fails:
1. Check Railway logs for specific errors
2. Verify all required environment variables are set
3. Ensure GitHub repo is up to date (`git push origin main`)
4. Check Railway build logs for compilation errors
