# MongoDB Connection Troubleshooting Guide

## Current Issue
**Error:** `SSL routines:ssl3_read_bytes:tlsv1 alert internal error (SSL alert number 80)`

**Status:** MongoDB Atlas is rejecting TLS connections from the Node.js client

## Attempted Solutions (ALL FAILED)

1. ✗ Added `tlsAllowInvalidCertificates: true` to connection options
2. ✗ Embedded TLS options in connection string
3. ✗ Increased `serverSelectionTimeoutMS` 
4. ✗ Added `maxPoolSize` configuration
5. ✗ Tried both code-level options and URL parameters

## Root Cause Analysis

This error typically occurs when:

### Most Likely Causes:
1. **IP Whitelist** - MongoDB Atlas may not have your current IP whitelisted
   - Solution: Add current IP to Atlas Network Access
   - Or use `0.0.0.0/0` for testing (allow all)

2. **Outdated MongoDB Driver** - Driver may not support Atlas's TLS version
   - Current: Check `package.json` for mongodb version
   - Solution: Upgrade to latest `npm install mongodb@latest`

3. **Node.js OpenSSL Version** - Windows Node.js may have OpenSSL incompatibility
   - Check: `node -p process.versions.openssl`
   - Solution: Upgrade Node.js to latest LTS

4. **MongoDB Atlas Server Issue** - Temporary Atlas outage or maintenance
   - Check: https://status.mongodb.com/
   - Solution: Wait or switch to different cluster region

### Less Likely:
5. **Firewall/Antivirus** - Blocking outgoing TLS on port 27017
6. **VPN/Proxy** - Interfering with SSL/TLS handshake
7. **Atlas Cluster Paused** - Free tier clusters pause after inactivity

## Immediate Action Steps

### Step 1: Check MongoDB Atlas Dashboard
```
1. Log in to cloud.mongodb.com
2. Go to Network Access → Add IP Address
3. Click "Allow Access From Anywhere" (0.0.0.0/0)
4. Wait 1-2 minutes for changes to propagate
5. Test connection again
```

### Step 2: Verify Connection String
```bash
# Test connection with MongoDB Shell
mongosh "mongodb+srv://coinruler:sevynmine06@cluster0.dx7blfq.mongodb.net/cryptoAdvisorUltimate"
```

### Step 3: Update MongoDB Driver
```bash
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace
npm install mongodb@latest
npm run build
```

### Step 4: Check Node.js Version
```bash
node --version  # Should be v18+ or v20+
node -p process.versions.openssl  # Should be 3.0+
```

### Step 5: Try Alternative Connection String
```bash
# Use direct connection (non-SRV) as fallback
mongodb://ac-9z0ccme-shard-00-00.dx7blfq.mongodb.net:27017,ac-9z0ccme-shard-00-01.dx7blfq.mongodb.net:27017,ac-9z0ccme-shard-00-02.dx7blfq.mongodb.net:27017/cryptoAdvisorUltimate?ssl=true&replicaSet=atlas-joxu0x-shard-0&authSource=admin&retryWrites=true&w=majority
```

## Temporary Workaround: Mock Mode

Until MongoDB connection is fixed, enable mock mode to test UI:

### Option A: Use Local MongoDB
```bash
# Install MongoDB locally
docker run -d -p 27017:27017 mongo:latest

# Update .env
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=cryptoAdvisorUltimate
```

### Option B: Mock Database Layer
Create `WorkSpace/apps/api/src/mockDb.ts`:
```typescript
export const mockDb = {
  collection: () => ({
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
    findOne: async () => null,
    insertOne: async () => ({ insertedId: 'mock-id' }),
    updateOne: async () => ({ modifiedCount: 1 }),
    deleteOne: async () => ({ deletedCount: 1 }),
  })
};
```

Then in `index.ts`, use mock when real DB unavailable:
```typescript
const db = realDb || mockDb;
```

## Next Steps

1. **CHECK ATLAS DASHBOARD** - Most likely fix
2. **Upgrade Node.js** - Download from nodejs.org
3. **Update MongoDB Driver** - `npm install mongodb@latest`
4. **Test with MongoDB Compass** - GUI tool to verify connection works
5. **Contact MongoDB Support** - If all else fails

## Current Status: BLOCKED ⛔

The API is running but **ALL data endpoints return 503** because database is not connected.

### What Works:
- ✅ API starts on port 3001
- ✅ Health endpoint `/health` returns (showing db: 'disconnected')
- ✅ SSE endpoint `/live` works (EventSource connects)

### What's Broken:
- ❌ `/dashboard` → 503
- ❌ `/approvals` → 503
- ❌ `/portfolio` → 503
- ❌ `/chat/stream` → Likely 503 (needs testing)
- ❌ All POST/PATCH operations → 503

## Recommended Path Forward

**PRIORITY 1:** Fix MongoDB connection (Atlas IP whitelist most likely)
**PRIORITY 2:** While waiting, work on UI/frontend (doesn't require DB)
**PRIORITY 3:** Implement mock mode for full-stack local development
**PRIORITY 4:** Add better error handling (retry with exponential backoff)

---

**Created:** $(Get-Date)
**Last Tested:** API logs show continuous 503 errors
**Atlas Cluster:** cluster0.dx7blfq.mongodb.net (3-node replica set)
**Database:** cryptoAdvisorUltimate
