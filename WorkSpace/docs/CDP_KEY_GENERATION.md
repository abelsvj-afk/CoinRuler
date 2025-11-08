# Generating Coinbase CDP API Keys for Advanced Trade

## ⚠️ IMPORTANT: You Need PEM-Formatted EC Private Keys

Your current key file has this format:
```json
{
  "id": "aae9b621-a7e0-4492-9e21-721f31227009",
  "privateKey": "lcWSaCwaB+XxEeGaumHrwP6E1unX2xE+VZF6McgSczkHr5v4Iajs5XlxAEQfdH+4edv5ALxWJKDaWCD+vquOrQ=="
}
```

But the **official Coinbase Advanced Trade SDK** requires keys in this format:
```json
{
  "name": "organizations/{org_id}/apiKeys/{key_id}",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIBcQ5...\n-----END EC PRIVATE KEY-----\n"
}
```

## How to Generate Correct CDP API Keys

### Step 1: Go to the CDP Portal
Visit: **https://portal.cdp.coinbase.com/access/api**

OR

Visit: **https://cloud.coinbase.com/access/api**

### Step 2: Create New API Key
1. Click "Create API Key" or "+ New API Key"
2. Give it a name (e.g., "CoinRuler Bot")
3. **Select the scopes you need:**
   - `wallet:accounts:read` - View account balances
   - `wallet:trades:read` - View trade history  
   - `wallet:orders:read` - View orders
   - `wallet:orders:create` - Place orders (when ready for live trading)
   - `wallet:user:read` - View user info
   - `wallet:buys:read` / `wallet:sells:read` - View buys/sells

### Step 3: Download the Key File
After creating the key, a **JSON file will be downloaded automatically**.

The file should be named something like: `cdp_api_key.json`

### Step 4: Verify the Key Format
Open the downloaded JSON file. It should look like:

```json
{
  "name": "organizations/12345678-1234-1234-1234-123456789abc/apiKeys/abcd1234-5678-90ab-cdef-1234567890ab",
  "privateKey": "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIFxyz123...(long base64 string)...\n-----END EC PRIVATE KEY-----\n"
}
```

Key indicators this is correct:
- ✅ `name` field starts with `organizations/`
- ✅ `privateKey` starts with `-----BEGIN EC PRIVATE KEY-----`
- ✅ `privateKey` ends with `-----END EC PRIVATE KEY-----`

### Step 5: Update Your Environment Variables

Extract the values and update your `.env` files:

```bash
# The "name" field becomes your API key
COINBASE_API_KEY="organizations/12345678-1234-1234-1234-123456789abc/apiKeys/abcd1234-5678-90ab-cdef-1234567890ab"

# The "privateKey" field becomes your API secret (include the BEGIN/END lines and \n characters)
COINBASE_API_SECRET="-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIFxyz123...\n-----END EC PRIVATE KEY-----\n"
```

**Important:** When pasting the private key:
- Keep the `-----BEGIN EC PRIVATE KEY-----` header
- Keep the `-----END EC PRIVATE KEY-----` footer
- Keep the `\n` characters (they represent newlines)
- Put the entire value in quotes

### Alternative: Use the Key File Directly

You can also pass the path to the downloaded JSON file:

```typescript
import { CoinbaseJwtClient } from '@coinruler/shared';

const client = new CoinbaseJwtClient({
  keyFile: 'path/to/cdp_api_key.json'
});
```

## Why Your Current Keys Don't Work

Your current key format (`id` + base64 `privateKey`) is from a different Coinbase API service (possibly Commerce API or an older format). 

The **Advanced Trade API** (which is what the dashboard needs) requires:
1. CDP (Coinbase Developer Platform) keys
2. EC (Elliptic Curve) private keys in PEM format  
3. JWT authentication with ES256 algorithm (not HMAC)

## Next Steps

1. Generate new CDP API keys using the portal link above
2. Download the JSON file
3. Verify it has the correct PEM format
4. Update your `.env` files with the new credentials
5. Restart the API server
6. Check `/coinbase/status` - it should now show `connected`!

## Troubleshooting

### "Missing required scopes" error
- Go back to the CDP portal
- Edit your API key
- Enable more scopes (especially `wallet:accounts:read`)

### "Invalid CDP private key format" error
- Double-check the private key starts with `-----BEGIN EC PRIVATE KEY-----`
- Make sure you're using keys from https://portal.cdp.coinbase.com (not other Coinbase portals)

### Still seeing 401 errors
- Verify the `name` field starts with `organizations/`
- Check that your Coinbase account has access to Advanced Trade
- Try generating a fresh key with all permissions enabled

### Full Scope / Permission Checklist (Advanced Trade)
When creating or editing your CDP API key, ensure these scopes (wording may vary slightly in UI):

| Scope | Purpose |
|-------|---------|
| wallet:accounts:read | List balances / accounts |
| wallet:orders:read | Read existing brokerage orders |
| wallet:orders:create | Place new orders (enable only when ready) |
| wallet:trades:read | Retrieve fills / trade history |
| wallet:user:read | Basic user data (sometimes required context) |
| wallet:buys:read / wallet:sells:read | View historical buy/sell activity |
| wallet:portfolios:read (if available) | Portfolio grouping info |

If you only want read‑only access at first, you can skip `wallet:orders:create`.

### Regenerating a Key With Correct Scopes
1. Visit https://portal.cdp.coinbase.com/access/api
2. Click your existing key → Edit (or delete and re-create if scopes cannot be modified).
3. Select all read scopes above (and create scope if needed later).
4. Save → Download new JSON (back it up securely!).
5. Update `.env` or set `keyFile` path for the new JSON.
6. Restart the API service.
7. Call `/coinbase/status` again; expected: `status: "connected"`.

### Confirming It’s a Scope Issue vs Format Issue
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| 401 with `Unauthorized` and JWT payload looks correct | Missing scopes | Regenerate with full read scopes |
| 401 and advice shows `Invalid key format` | Wrong key type (legacy/HMAC or malformed PEM) | Recreate via CDP portal |
| 403 and message about `Missing Required Scopes` | Partial scope set | Edit key and add scopes |
| `credentialType: cdp-pem` but balances empty | Auth OK, but no funded accounts | Deposit or transfer assets |

### Verifying JWT Locally (Optional Deep Dive)
You can decode the JWT (header.payload.signature) at https://jwt.io:
1. Run a test call locally (e.g., our `test-cdp-auth.ts`).
2. Copy the Bearer token.
3. Paste into jwt.io → Verify header has `alg: ES256`, `kid: organizations/.../apiKeys/...`.
4. Payload should include: `sub` (same as key), `iss: cdp`, `nbf`, `exp` (≈ +120s), and `uri` for REST calls.

### Adding User-Agent (Optional Tweak)
Although not required for auth, mirroring the official SDK header can help future debugging:
```
User-Agent: coinbase-advanced-py/1.x.x
```
Our client can be extended to send this if desired.

### Minimal Manual Curl Test (After Scopes Fixed)
Replace placeholders with your JWT:
```
curl -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  https://api.coinbase.com/api/v3/brokerage/accounts
```
Expect: JSON with `accounts` array (possibly empty but no 401).

### Next After Successful Auth
Once `/coinbase/status` reports `connected`:
1. Hit `/accounts` (or our wrapper) to confirm balances.
2. Trigger `/portfolio/snapshot/force` to persist initial snapshot.
3. Enable live trade preview (keep `DRY_RUN=true` until confident).
4. Later, add `wallet:orders:create` only when ready to execute.

### If 401 Persists After Scope Fix
Checklist:
1. Did you restart the API process after updating `.env`?
2. Are there hidden carriage returns in the PEM? (Open the file in a plain text editor.)
3. Ensure PEM still contains literal `\n` escapes inside `.env`; our loader converts them to real newlines.
4. Generate a brand-new key (sometimes initial provisioning glitches).
5. Test with official Python SDK (`pip install coinbase-advanced-py`) using the same key to isolate our client vs key issue.

If Python SDK also returns 401 → key/scopes/account issue (contact Coinbase support or Discord). If Python works but Node fails → we’ll add deeper header parity (User-Agent) and re-verify signing libs.

