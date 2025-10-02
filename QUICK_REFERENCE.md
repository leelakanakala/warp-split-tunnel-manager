# Zoom WARP Manager - Quick Reference

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Create KV namespace
wrangler kv:namespace create "ZOOM_IP_CACHE"

# Set API token
wrangler secret put CLOUDFLARE_API_TOKEN

# Deploy
npm run deploy

# Monitor logs
wrangler tail
```

## 📡 Common API Calls

### List Accounts
```bash
curl https://your-worker.workers.dev/accounts
```

### Select Account
```bash
curl -X POST https://your-worker.workers.dev/accounts/select \
  -H "Content-Type: application/json" \
  -d '{"account_id": "YOUR_ACCOUNT_ID"}'
```

### Check Status
```bash
curl https://your-worker.workers.dev/status
```

### Trigger Update
```bash
# Use selected account
curl -X POST https://your-worker.workers.dev/update

# Force fetch new Zoom IPs
curl -X POST https://your-worker.workers.dev/update \
  -H "Content-Type: application/json" \
  -d '{"force_fetch": true}'

# Update specific account
curl -X POST https://your-worker.workers.dev/update \
  -H "Content-Type: application/json" \
  -d '{"account_id": "YOUR_ACCOUNT_ID", "force_fetch": true}'
```

### View History
```bash
curl https://your-worker.workers.dev/history?limit=10
```

## 🔧 Configuration

### Required Secrets
```bash
wrangler secret put CLOUDFLARE_API_TOKEN
```

### Optional Secrets
```bash
wrangler secret put SELECTED_ACCOUNT_ID
```

### Environment Variables (wrangler.toml)
- `ZOOM_IP_SOURCE_URL`: Zoom IP source (default: Zoom official URL)
- `UPDATE_INTERVAL_HOURS`: Update interval (default: 24)
- `MAX_RETRIES`: Retry attempts (default: 3)

## 🎯 Workflow

### Initial Setup
1. Deploy the Worker
2. List available accounts
3. Select an account
4. Trigger first update
5. Verify status

### Daily Operations
- System automatically updates daily at 3 AM UTC
- Check status to verify updates
- View history for audit trail

## 🚨 Common Issues

### "No account selected"
**Fix**: Select an account first
```bash
curl -X POST https://your-worker.workers.dev/accounts/select \
  -H "Content-Type: application/json" \
  -d '{"account_id": "YOUR_ACCOUNT_ID"}'
```

### "Failed to fetch WARP profiles"
**Causes**:
- API token lacks Zero Trust permissions
- Account doesn't have Zero Trust enabled

**Fix**: Verify API token has `Account:Cloudflare Zero Trust:Edit` permission

### "Failed to fetch Zoom IPs"
**Fix**: System auto-retries. Check logs:
```bash
wrangler tail
```

## 📊 Expected Results

- **Zoom IPs Fetched**: ~150 IP ranges (varies)
- **Processing Time**: 5-15 seconds per profile
- **Update Frequency**: Daily at 3 AM UTC
- **Split Tunnel Mode**: Exclude (Zoom IPs bypass tunnel)

## 🔐 API Token Permissions

Required permissions:
- `Account:Cloudflare Zero Trust:Edit`
- `Account:Account Settings:Read`

Create token at: Cloudflare Dashboard → My Profile → API Tokens

## 📁 Key File Locations

- **Main Entry**: `src/index.ts`
- **Cloudflare API**: `src/services/cloudflareAPI.ts`
- **Zoom Fetcher**: `src/services/zoomIPFetcher.ts`
- **Storage**: `src/services/storageService.ts`
- **Manager**: `src/services/warpProfileManager.ts`
- **Types**: `src/types.ts`

## 💡 Tips

- Use `force_fetch: true` to bypass cache and get fresh Zoom IPs
- Check `/history` endpoint to track all updates
- Monitor logs with `wrangler tail` during updates
- Existing non-Zoom split tunnel entries are preserved
- System handles rate limiting automatically with delays

## 🔄 Update Process

1. Fetch Zoom IPs (from cache or fresh)
2. Get all WARP profiles for account
3. For each profile:
   - Get existing split tunnel config
   - Remove old Zoom entries
   - Add new Zoom entries
   - Preserve non-Zoom entries
   - Update profile
4. Store results and history

## 📈 Monitoring

### Check Last Update
```bash
curl https://your-worker.workers.dev/status | jq '.data.last_update'
```

### Check Success Rate
```bash
curl https://your-worker.workers.dev/history | jq '.data.history[].success'
```

### View Errors
```bash
curl https://your-worker.workers.dev/history | jq '.data.history[].errors'
```

---
*For detailed documentation, see README.md*
