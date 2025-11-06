# 🚀 Deploy CoinRuler to Railway - Step by Step

## Why Railway?
- ✅ Always online (no PC needed)
- ✅ Free $5/month credits (enough for this app)
- ✅ Auto-deploys from GitHub
- ✅ Professional URL
- ✅ Easy environment setup

---

## STEP-BY-STEP DEPLOYMENT

### **Step 1: Get MongoDB Atlas (Free Database)**

1. Go to: https://www.mongodb.com/cloud/atlas/register
2. Sign up (free)
3. Create a **FREE** cluster:
   - Provider: AWS
   - Region: Closest to you
   - Tier: M0 Sandbox (FREE)
4. Wait 3-5 minutes for cluster creation
5. Click "Connect" → "Connect your application"
6. Copy the connection string (looks like):
   ```
   mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Replace `<password>` with your actual password

**Save this connection string - you'll need it!**

---

### **Step 2: Create Discord Application (Optional but Recommended)**

1. Go to: https://discord.com/developers/applications
2. Click "New Application"
3. Name it "CoinRuler"
4. Go to "OAuth2" tab
5. Add Redirect URL: `https://your-app-name.up.railway.app/api/auth/callback/discord`
   - (You'll update this after getting your Railway URL)
6. Copy:
   - Client ID
   - Client Secret
7. Get your Discord User ID:
   - Discord Settings → Advanced → Enable Developer Mode
   - Right-click your username → Copy ID

**Save these - you'll need them!**

---

### **Step 3: Deploy to Railway**

#### **3.1: Sign Up**
1. Go to: https://railway.app
2. Click "Login" → Login with GitHub
3. Authorize Railway to access your repositories

#### **3.2: Create New Project**
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your **CoinRuler** repository
4. Railway will detect it's a Node.js project

#### **3.3: Create API Service**
1. Railway creates one service by default
2. Click on the service → Settings
3. Set these:
   - **Name**: `coinruler-api`
   - **Root Directory**: `WorkSpace/apps/api`
   - **Build Command**: Leave default or set: `cd ../../ && npm install && npm run build`
   - **Start Command**: `cd WorkSpace/apps/api && node dist/index.js`

#### **3.4: Add API Environment Variables**
1. Go to Variables tab
2. Click "Add Variable" and add each of these:

```bash
# MongoDB (REQUIRED)
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=cryptoAdvisorUltimate

# API Port
API_PORT=3001

# Discord Bot (if you have one)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_WEBHOOK_URL=your_webhook_url
OWNER_ID=your_discord_user_id

# Coinbase (if you use it)
COINBASE_API_KEY=your_coinbase_key
COINBASE_API_SECRET=your_coinbase_secret

# OpenAI (if you use it)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4
```

3. Click "Deploy" - Railway will build and start your API

#### **3.5: Create Web Service**
1. Click "Add Service" → "Deploy from GitHub"
2. Select your **CoinRuler** repository again
3. Settings:
   - **Name**: `coinruler-web`
   - **Root Directory**: `WorkSpace/apps/web`
   - **Build Command**: `cd ../../ && npm install && npm run build -w apps/web`
   - **Start Command**: `cd WorkSpace/apps/web && node .next/standalone/apps/web/server.js`

#### **3.6: Add Web Environment Variables**

First, get your API URL from the API service:
1. Click on your API service
2. Go to "Settings" → "Networking"
3. Copy the public URL (like: `https://coinruler-api-production-xxxx.up.railway.app`)

Now add web variables:

```bash
# Authentication (REQUIRED)
NEXTAUTH_URL=https://your-web-app.up.railway.app
NEXTAUTH_SECRET=YuTsTAHw3hbkq6YEXnA8V7SXPwtF/Gdjc/p6CrjCtj8=

# Password Login (REQUIRED - Change this!)
OWNER_PASSWORD=your_secure_password_here

# API Connection (REQUIRED)
NEXT_PUBLIC_API_URL=https://coinruler-api-production-xxxx.up.railway.app

# Discord OAuth (OPTIONAL - Better security)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
OWNER_DISCORD_ID=your_discord_user_id
```

3. Click "Deploy"

#### **3.7: Get Your Website URL**
1. Click on your Web service
2. Go to "Settings" → "Networking"
3. Click "Generate Domain"
4. You'll get a URL like: `https://coinruler-web-production-xxxx.up.railway.app`

#### **3.8: Update Discord Redirect (if using Discord OAuth)**
1. Go back to Discord Developer Portal
2. Update the redirect URL to your actual Railway URL:
   ```
   https://coinruler-web-production-xxxx.up.railway.app/api/auth/callback/discord
   ```

#### **3.9: Update NEXTAUTH_URL**
1. Go back to Railway → Web service → Variables
2. Update `NEXTAUTH_URL` to your actual Railway web URL
3. Redeploy

---

### **Step 4: Test Your Live Website!**

1. Go to your Railway web URL
2. You should see the login page
3. Login with your password
4. You're live! 🎉

**Your website is now:**
- ✅ Online 24/7
- ✅ Accessible from anywhere
- ✅ Protected with authentication
- ✅ Auto-deploys when you push to GitHub

---

## ALTERNATIVE: Custom Domain (Optional)

If you want a custom domain like `coinruler.com`:

1. Buy domain from Namecheap/GoDaddy
2. In Railway → Settings → Networking
3. Click "Custom Domain"
4. Add your domain
5. Update your domain's DNS to point to Railway

---

## Troubleshooting

### API won't start:
- Check MONGODB_URI is correct
- Verify all required env vars are set
- Check Railway logs for errors

### Web won't start:
- Make sure NEXTAUTH_SECRET is set
- Verify NEXT_PUBLIC_API_URL points to your API service
- Check build logs

### Can't login:
- Verify OWNER_PASSWORD is set
- Check NEXTAUTH_URL matches your actual web URL
- Clear browser cache

### 404 errors:
- Make sure Start Command is correct
- Verify build completed successfully
- Check Root Directory is set

---

## Costs

**Railway Free Tier:**
- $5 free credits per month
- Your app will use ~$2-3/month
- Plenty for one user!

**If you need more:**
- Hobby plan: $5/month (500 hours)
- Pro plan: $20/month (unlimited)

---

## What Happens Next?

Every time you:
1. Make changes to your code
2. Run `git push origin main`
3. Railway automatically rebuilds and deploys! 🚀

No manual steps needed after initial setup!

---

## Quick Commands Summary

```powershell
# To update your live site:
git add .
git commit -m "Your changes"
git push origin main

# Railway auto-deploys in ~2-3 minutes
```

---

## Support

**Need help?**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check Railway logs for errors

**Your setup:**
- Code: https://github.com/abelsvj-afk/CoinRuler
- API: Railway Service 1
- Web: Railway Service 2
- Database: MongoDB Atlas (free)

---

🎉 **You're ready to deploy! Follow the steps above and you'll have a live website in ~15 minutes!**
