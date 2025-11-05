# Security & Credential Rotation Guide

This document explains how to rotate credentials for all critical services used by CoinRuler. Always rotate credentials immediately if you suspect exposure or after a team member leaves.

---

## 1. Coinbase API Key Rotation

1. Log in to your Coinbase (or Coinbase Pro/Advanced Trade) account.
2. Go to **API Settings**.
3. Create a new API key with the same permissions as the old one (read, trade, etc.).
4. Update your `.env` file:
   - `COINBASE_API_KEY=...`
   - `COINBASE_API_SECRET=...`
   - `COINBASE_API_PASSPHRASE=...` (if required)
5. Deploy the new `.env` to your server/host (Railway, etc.).
6. Remove the old API key from Coinbase.
7. Confirm the bot can fetch balances and (if enabled) place test orders.

---

## 2. Discord Bot Token Rotation

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Select your bot application.
3. Under **Bot**, click **Regenerate Token**.
4. Update your `.env` file:
   - `DISCORD_TOKEN=...`
5. Redeploy/restart your bot service.
6. If using slash commands, re-run `node scripts/register_slash_commands.js`.
7. Remove any old tokens from your secrets manager or deployment config.

---

## 3. MongoDB Atlas Password Rotation

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com/).
2. Go to **Database Access**.
3. Edit your database user and set a new password.
4. Update your `.env` file:
   - `MONGODB_URI=mongodb+srv://<user>:<newpassword>@...`
5. Redeploy/restart your bot service.
6. Remove any old connection strings from your secrets manager or deployment config.

---

## 4. General Best Practices

- **Never commit `.env` or secrets to git.**
- Use a secrets manager (Railway, Vercel, AWS Secrets Manager, etc.) for production.
- Rotate credentials at least every 90 days or after any incident.
- Remove unused API keys and users from all services.
- Use least-privilege permissions for all API keys.
- Enable 2FA/MFA on all accounts.

---

For questions or help, contact the project owner or maintainer.
