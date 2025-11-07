# 🌐 Deploy Your CoinRuler Website

Your website is already running locally at http://localhost:3000! Here's how to make it live on the internet:

---

## ⚡ Quick Deploy Options

### **Option 1: Vercel (Easiest & Free)** ⭐ RECOMMENDED

**Why Vercel?**
- Built specifically for Next.js
- Free tier with custom domains
- Auto-deploy on every GitHub push
- Global CDN for fast loading
- Zero configuration needed

**Steps:**

1. **Sign up at https://vercel.com** (use your GitHub account)

2. **Import Your Repository**
   - Click "Add New Project"
   - Select your `CoinRuler` repository
   - Click "Import"

3. **Configure Project Settings**
   ```
   Framework Preset: Next.js
   Root Directory: WorkSpace/apps/web
   Build Command: npm run build
   Output Directory: .next
   Install Command: npm install
   Node.js Version: 20.x
   ```

   **Important:** Make sure to set the Root Directory to `WorkSpace/apps/web`

4. **Add Environment Variable**
   Go to Settings → Environment Variables → Add:
   ```
   Name: NEXT_PUBLIC_API_BASE
   Value: https://your-railway-api.railway.app
   ```
   (Replace with your actual Railway API URL)

5. **Deploy!**
   - Click "Deploy"
   - Wait 2-3 minutes
   - Your site will be live at `https://your-project.vercel.app`

6. **Add Custom Domain (Optional)**
   - Go to Settings → Domains
   - Add your domain (e.g., `coinruler.com`)
   - Follow DNS setup instructions

**That's it!** Every time you push to GitHub, Vercel auto-deploys your changes. ✨

---

### **Option 2: Railway (Keep Everything Together)** 🚂

**Why Railway?**
- Your API is already there
- One platform for everything
- Easy service management

**Steps:**

1. **Open Your Railway Project**
   Go to https://railway.app/project/your-project-id

2. **Add New Service**
   - Click "New Service"
   - Choose "GitHub Repo"
   - Select your CoinRuler repository
   - Set root directory: `WorkSpace/apps/web`

3. **Configure Environment Variables**
   In the web service's Variables tab:
   ```
   NEXT_PUBLIC_API_BASE=https://your-api-service.railway.app
   NODE_ENV=production
   ```

4. **Railway Auto-Detects Everything**
   - Finds the Dockerfile
   - Builds and deploys automatically
   - Exposes on port 3000

5. **Get Your URL**
   - Go to Settings → Domains
   - Copy the generated URL: `your-web.up.railway.app`
   - Or add a custom domain

**Done!** Railway will auto-deploy on every push to main.

---

### **Option 3: Netlify (Alternative Free Option)**

**Steps:**
1. Go to https://netlify.com
2. "Import from GitHub" → Select CoinRuler
3. Configure:
   ```
   Base directory: WorkSpace/apps/web
   Build command: npm run build
   Publish directory: .next
   ```
4. Add environment variable: `NEXT_PUBLIC_API_BASE`
5. Deploy!

---

## 🔧 Current Setup

✅ **Your local environment is running:**
- API: http://localhost:3001
- Web: http://localhost:3000

✅ **Deployment files ready:**
- `Dockerfile` - For Railway/Docker deployment
- `railway.json` - Railway configuration
- `next.config.ts` - Already configured with `output: 'standalone'`

---

## 🚀 Recommended: Use Vercel

**Why?** It's literally made for Next.js apps and handles everything automatically:
- ✅ Zero configuration
- ✅ Automatic HTTPS
- ✅ Global CDN
- ✅ Auto-deploy from GitHub
- ✅ Free custom domains
- ✅ Preview deployments for PRs

**Time to deploy: ~5 minutes**

---

## 📝 After Deployment Checklist

Once your website is live:

1. **Update API CORS**
   Add your new website URL to the API's allowed origins:
   - Go to Railway → API service → Variables
   - Add: `WEB_ORIGIN=https://your-site.vercel.app`

2. **Test the Connection**
   - Open your live website
   - Try logging in
   - Check if data loads from the API

3. **Custom Domain (Optional)**
   - Buy a domain (Namecheap, GoDaddy, etc.)
   - Add it in Vercel/Railway settings
   - Update DNS records as instructed

4. **Enable HTTPS (Auto-enabled)**
   Both Vercel and Railway provide free SSL certificates automatically.

---

## 🎉 You're Done!

Your CoinRuler website will be live on the internet, accessible from anywhere!

**Questions?**
- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- Next.js Deployment: https://nextjs.org/docs/deployment
