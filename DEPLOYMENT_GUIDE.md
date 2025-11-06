# 🚀 CoinRuler Permanent Website Deployment (Private Access)

## **Option 1: Railway (Recommended - Free Tier Available)**

### **What You Get:**
- Permanent URL: `https://your-app.up.railway.app`
- Automatic HTTPS
- Environment-based authentication
- Free tier: $5/month in credits (enough for small apps)
- Auto-deploys from GitHub

### **Setup Steps:**

#### 1. **Sign Up & Create Project**
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your `CoinRuler` repository

#### 2. **Create Two Services**

**Service A: API Backend**
1. Name: `coinruler-api`
2. Root Directory: `WorkSpace/apps/api`
3. Build Command: `cd ../../ && npm install && npm run build`
4. Start Command: `cd WorkSpace/apps/api && node dist/index.js`

**Service B: Web Frontend**
1. Click "Add Service" → "Deploy from GitHub"
2. Name: `coinruler-web`
3. Root Directory: `WorkSpace/apps/web`
4. Build Command: `cd ../../ && npm install && npm run build -w apps/web`
5. Start Command: `cd WorkSpace/apps/web && node .next/standalone/apps/web/server.js`

#### 3. **Set Environment Variables**

**For API Service:**
```bash
# Required
MONGODB_URI=your_mongodb_atlas_connection_string
DATABASE_NAME=cryptoAdvisorUltimate
API_PORT=3001

# Discord Integration
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_WEBHOOK_URL=your_webhook_url
DISCORD_MONITOR_WEBHOOK=your_monitor_webhook

# Coinbase (optional)
COINBASE_API_KEY=your_api_key
COINBASE_API_SECRET=your_api_secret

# AI Features
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4

# Security - IMPORTANT FOR PRIVATE ACCESS
AUTH_SECRET=generate_random_32_char_string_here
ALLOWED_USERS=your_email@example.com
```

**For Web Service:**
```bash
# API Connection (use Railway's internal URL)
NEXT_PUBLIC_API_URL=https://coinruler-api.up.railway.app

# Authentication - CRITICAL FOR PRIVATE ACCESS
NEXTAUTH_URL=https://coinruler-web.up.railway.app
NEXTAUTH_SECRET=generate_different_random_32_char_string
ALLOWED_EMAILS=your_email@example.com

# OAuth (for secure login - recommended)
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_secret
```

#### 4. **Generate Auth Secrets**
Run this in PowerShell to generate secure secrets:
```powershell
# Generate AUTH_SECRET
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Generate NEXTAUTH_SECRET (different one)
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

#### 5. **Deploy**
- Railway will auto-deploy when you push to `main` branch
- Check logs in Railway dashboard for any errors
- Your web app will be at: `https://coinruler-web.up.railway.app`

---

## **Option 2: Cloudflare Tunnel (100% Free, No Signup)**

### **What You Get:**
- Permanent URL: `https://your-custom-name.trycloudflare.com`
- Free forever
- Runs from your PC (must stay on)
- Password-protected access

### **Setup Steps:**

#### 1. **Install Cloudflare Tunnel**
```powershell
# Download cloudflared
winget install --id Cloudflare.cloudflared
```

#### 2. **Create Tunnel Configuration**
```powershell
cd C:\Users\Student\Desktop\CoinRuler
mkdir cloudflared
cd cloudflared

# Create config.yml
@"
url: http://localhost:3000
tunnel: CoinRuler
credentials-file: C:\Users\Student\Desktop\CoinRuler\cloudflared\cert.json
"@ | Out-File -FilePath config.yml -Encoding UTF8
```

#### 3. **Start Your Services**
```powershell
# Terminal 1: Start API
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\api
node dist/index.js

# Terminal 2: Start Web
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace
node apps/web/.next/standalone/apps/web/server.js

# Terminal 3: Start Tunnel
cloudflared tunnel --url http://localhost:3000
```

#### 4. **Secure Access**
Add basic auth to your Next.js middleware:
- I can help you add password protection to the web app

---

## **Option 3: Render.com (Free Tier)**

### **What You Get:**
- Free hosting (with sleep after 15 min inactivity)
- Permanent URL
- Easy deployment

### **Setup:**
1. Go to [render.com](https://render.com)
2. Create Web Service from GitHub
3. Add environment variables (same as Railway)
4. Deploy!

---

## **🔒 Security: Making It Private (Owner-Only)**

### **Method 1: Email Whitelist (Recommended)**

I can add NextAuth.js authentication:
- Only your email can access
- Google OAuth login
- Session management

### **Method 2: HTTP Basic Auth (Simple)**

Add to your Web service environment:
```bash
BASIC_AUTH_USER=yourusername
BASIC_AUTH_PASSWORD=strongpassword123
```

### **Method 3: IP Whitelist**

In Railway/Render, add firewall rules to only allow your IP address.

---

## **Which Should You Choose?**

| Feature | Railway | Cloudflare Tunnel | Render |
|---------|---------|-------------------|--------|
| **Cost** | $5/mo free credits | 100% Free | Free (limited) |
| **Setup Time** | 15 min | 5 min | 15 min |
| **Always On** | ✅ Yes | ❌ PC must run | ⚠️ Sleeps when idle |
| **Custom Domain** | ✅ Easy | ✅ Yes | ✅ Yes |
| **Auto Deploy** | ✅ From GitHub | ❌ Manual | ✅ From GitHub |
| **Best For** | Production | Testing/Home | Free hosting |

---

## **🎯 My Recommendation for You**

**Use Railway** because:
1. You already have the config files
2. Auto-deploys from GitHub (you're already using)
3. Professional URLs
4. Good free tier
5. Easy to add authentication

**Next Steps:**
1. Set up MongoDB Atlas (free tier) if you haven't
2. Create Railway account
3. Deploy both services
4. Add email whitelist authentication
5. Access from anywhere!

Would you like me to:
- Add NextAuth.js authentication for email-only access?
- Help you deploy to Railway step-by-step?
- Set up Cloudflare Tunnel for quick testing?
