# Deployment Guide

This guide walks you through deploying the Zoom WARP Manager to Cloudflare Workers.

## Prerequisites Checklist

- [ ] Cloudflare account with Zero Trust enabled
- [ ] Node.js 18+ installed
- [ ] npm installed
- [ ] Wrangler CLI installed (`npm install -g wrangler`)
- [ ] Cloudflare API token created

## Step 1: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **My Profile** → **API Tokens**
3. Click **Create Token**
4. Choose **Create Custom Token**
5. Configure the token:
   - **Token name**: `Zoom WARP Manager`
   - **Permissions**:
     - Account → Cloudflare Zero Trust → Edit
     - Account → Account Settings → Read
   - **Account Resources**: Include → Your Account
   - **Client IP Address Filtering**: (Optional) Add your IP for extra security
   - **TTL**: (Optional) Set expiration date
6. Click **Continue to summary**
7. Click **Create Token**
8. **IMPORTANT**: Copy the token immediately (you won't see it again)

## Step 2: Install Dependencies

```bash
cd ~/Documents/Projects/zoom-warp-manager
npm install
```

## Step 3: Create KV Namespace

```bash
# Create the KV namespace
wrangler kv:namespace create "ZOOM_IP_CACHE"
```

You'll see output like:
```
🌀 Creating namespace with title "zoom-warp-manager-ZOOM_IP_CACHE"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "ZOOM_IP_CACHE", id = "abc123def456..." }
```

Copy the `id` value.

## Step 4: Update Configuration

Edit `wrangler.toml` and replace the KV namespace ID:

```toml
[[kv_namespaces]]
binding = "ZOOM_IP_CACHE"
id = "abc123def456..."  # Replace with your actual ID from Step 3
```

## Step 5: Set Secrets

```bash
# Set your Cloudflare API token (required)
wrangler secret put CLOUDFLARE_API_TOKEN
# Paste your token when prompted

# Optional: Pre-select an account ID (if you know it)
wrangler secret put SELECTED_ACCOUNT_ID
# Paste your account ID when prompted
```

## Step 6: Deploy

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

You'll see output like:
```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded zoom-warp-manager (X.XX sec)
Published zoom-warp-manager (X.XX sec)
  https://zoom-warp-manager.your-subdomain.workers.dev
```

Copy your Worker URL.

## Step 7: Verify Deployment

```bash
# Test the root endpoint
curl https://zoom-warp-manager.your-subdomain.workers.dev/

# You should see system information
```

## Step 8: Initial Setup

### 8.1 List Available Accounts

```bash
curl https://zoom-warp-manager.your-subdomain.workers.dev/accounts
```

Copy the `id` of the account you want to manage.

### 8.2 Select Account

```bash
curl -X POST https://zoom-warp-manager.your-subdomain.workers.dev/accounts/select \
  -H "Content-Type: application/json" \
  -d '{"account_id": "YOUR_ACCOUNT_ID_HERE"}'
```

### 8.3 Check Status

```bash
curl https://zoom-warp-manager.your-subdomain.workers.dev/status
```

Verify that:
- `selected_account_id` is set
- `warp_profiles_count` shows your profiles

### 8.4 Trigger First Update

```bash
curl -X POST https://zoom-warp-manager.your-subdomain.workers.dev/update
```

This will:
1. Fetch Zoom IPs
2. Update all WARP profiles
3. Store results

## Step 9: Monitor

### View Logs

```bash
wrangler tail
```

Keep this running in a separate terminal to see real-time logs.

### Check Update Results

```bash
# View the last update
curl https://zoom-warp-manager.your-subdomain.workers.dev/status | jq '.data.last_update'

# View update history
curl https://zoom-warp-manager.your-subdomain.workers.dev/history
```

## Step 10: Verify WARP Profiles

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Settings** → **WARP Client**
3. Click on a **Device Profile**
4. Go to **Split Tunnels** section
5. Verify that Zoom IP ranges are listed with description "Zoom IP Range (Auto-updated)"

## Scheduled Updates

The system is now configured to automatically update daily at 3 AM UTC. No further action needed!

To change the schedule, edit `wrangler.toml`:

```toml
[triggers]
crons = ["0 3 * * *"]  # Modify this cron expression
```

Then redeploy:
```bash
npm run deploy
```

## Troubleshooting Deployment

### Error: "Authentication error"

**Solution**: Login to Wrangler
```bash
wrangler login
```

### Error: "KV namespace not found"

**Solution**: Verify the KV namespace ID in `wrangler.toml` matches the one created in Step 3.

### Error: "Failed to fetch accounts"

**Causes**:
- Invalid API token
- API token lacks required permissions

**Solution**: 
1. Verify token has correct permissions (see Step 1)
2. Reset the secret:
   ```bash
   wrangler secret put CLOUDFLARE_API_TOKEN
   ```

### Error: "No account selected"

**Solution**: Complete Step 8.2 to select an account.

### Error: "Failed to fetch WARP profiles"

**Causes**:
- Account doesn't have Zero Trust enabled
- API token lacks Zero Trust permissions

**Solution**:
1. Verify Zero Trust is enabled in your Cloudflare account
2. Verify API token has `Account:Cloudflare Zero Trust:Edit` permission

## Post-Deployment Checklist

- [ ] Worker deployed successfully
- [ ] Root endpoint returns system info
- [ ] Account selected
- [ ] First update completed successfully
- [ ] WARP profiles show Zoom IPs in Cloudflare dashboard
- [ ] Logs show no errors
- [ ] Scheduled cron trigger configured

## Updating the Worker

To deploy changes:

```bash
# Make your changes to the code
# Then deploy
npm run deploy
```

Secrets and KV data persist across deployments.

## Rollback

If you need to rollback:

```bash
# View deployment history
wrangler deployments list

# Rollback to a previous deployment
wrangler rollback [deployment-id]
```

## Uninstalling

To remove the Worker:

```bash
# Delete the Worker
wrangler delete

# Delete the KV namespace (optional)
wrangler kv:namespace delete --namespace-id=YOUR_KV_ID

# Delete secrets (they're automatically removed with the Worker)
```

## Next Steps

- Set up monitoring alerts
- Review update history regularly
- Consider setting up a custom domain
- Add the Worker URL to your documentation
- Schedule regular API token rotation

## Support

If you encounter issues:
1. Check `wrangler tail` for error logs
2. Review the troubleshooting section above
3. Consult the main README.md
4. Check Cloudflare Workers documentation
5. Verify Cloudflare Zero Trust API documentation

---

**Congratulations!** Your Zoom WARP Manager is now deployed and running. 🎉
