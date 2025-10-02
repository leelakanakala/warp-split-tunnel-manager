# Zoom WARP Manager

A Cloudflare Workers-based system that automatically fetches Zoom IP ranges and updates all WARP profiles in your Cloudflare Zero Trust account with split tunnel configurations.

## Features

- **Automatic Zoom IP Fetching**: Retrieves the latest Zoom IP ranges from the official source
- **Multi-Account Support**: Manage WARP profiles across multiple Cloudflare accounts
- **Smart Merging**: Preserves existing split tunnel configurations while updating Zoom IPs
- **Scheduled Updates**: Automatic daily updates via cron triggers
- **KV Caching**: Optional caching of Zoom IPs to reduce external API calls
- **Update History**: Track all updates with detailed results
- **RESTful API**: Comprehensive API for management and monitoring

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Zoom IP Source │───▶│ Cloudflare Worker │───▶│ Cloudflare API  │
│  (Zoom Docs)    │    │  (Processing)     │    │ (Zero Trust)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Cloudflare KV    │
                       │ (IP Cache)       │
                       └──────────────────┘
```

## Quick Start

### 1. Prerequisites

- Cloudflare account with Zero Trust enabled
- Cloudflare API token with the following permissions:
  - `Account:Cloudflare Zero Trust:Edit`
  - `Account:Account Settings:Read`
- Node.js 18+ and npm
- Wrangler CLI

### 2. Installation

```bash
# Navigate to project directory
cd ~/Documents/Projects/zoom-warp-manager

# Install dependencies
npm install

# Generate TypeScript types for Cloudflare Workers
npm run cf-typegen
```

### 3. Configuration

#### Create KV Namespace

```bash
# Create KV namespace for Zoom IP caching
wrangler kv:namespace create "ZOOM_IP_CACHE"

# Update wrangler.toml with the returned namespace ID
```

#### Set Secrets

```bash
# Set your Cloudflare API token (required)
wrangler secret put CLOUDFLARE_API_TOKEN

# Optional: Pre-select an account ID
wrangler secret put SELECTED_ACCOUNT_ID
```

#### Update wrangler.toml

Replace the KV namespace ID in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ZOOM_IP_CACHE"
id = "your-actual-kv-namespace-id"  # Replace with your KV namespace ID
```

### 4. Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy

# Test the deployment
curl https://zoom-warp-manager.your-subdomain.workers.dev/
```

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | System information and available endpoints |
| `GET` | `/status` | System status and statistics |
| `POST` | `/update` | Manually trigger WARP profile update |

### Account Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/accounts` | List all available Cloudflare accounts |
| `POST` | `/accounts/select` | Select an account for management |
| `GET` | `/accounts/selected` | Get currently selected account |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/history` | Get update history (optional: ?limit=10) |
| `POST` | `/reset` | Reset all data (dangerous) |

## Usage Guide

### Step 1: List Available Accounts

```bash
curl https://zoom-warp-manager.your-subdomain.workers.dev/accounts
```

Response:
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "id": "abc123...",
        "name": "My Organization",
        "type": "standard"
      }
    ],
    "count": 1
  }
}
```

### Step 2: Select an Account

```bash
curl -X POST https://zoom-warp-manager.your-subdomain.workers.dev/accounts/select \
  -H "Content-Type: application/json" \
  -d '{"account_id": "abc123..."}'
```

### Step 3: Check System Status

```bash
curl https://zoom-warp-manager.your-subdomain.workers.dev/status
```

Response:
```json
{
  "success": true,
  "data": {
    "last_update": "2025-10-02T03:00:00.000Z",
    "last_update_success": true,
    "zoom_ips_count": 150,
    "zoom_ips_last_fetched": "2025-10-02T03:00:00.000Z",
    "accounts_available": 1,
    "selected_account_id": "abc123...",
    "selected_account_name": "My Organization",
    "warp_profiles_count": 3,
    "next_scheduled_update": "2025-10-03T03:00:00.000Z"
  }
}
```

### Step 4: Trigger Manual Update

```bash
# Update using selected account
curl -X POST https://zoom-warp-manager.your-subdomain.workers.dev/update

# Update specific account with force fetch
curl -X POST https://zoom-warp-manager.your-subdomain.workers.dev/update \
  -H "Content-Type: application/json" \
  -d '{"account_id": "abc123...", "force_fetch": true}'
```

Response:
```json
{
  "success": true,
  "data": {
    "success": true,
    "account_id": "abc123...",
    "account_name": "My Organization",
    "profiles_updated": 3,
    "profiles_failed": 0,
    "ips_added": 150,
    "total_ips": 150,
    "processing_time_ms": 5420,
    "errors": [],
    "updated_profiles": [
      {
        "profile_id": "profile1",
        "profile_name": "Default Profile",
        "success": true
      }
    ]
  }
}
```

### Step 5: View Update History

```bash
# Get last 10 updates
curl https://zoom-warp-manager.your-subdomain.workers.dev/history

# Get last 20 updates
curl https://zoom-warp-manager.your-subdomain.workers.dev/history?limit=20
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token (required) | - |
| `SELECTED_ACCOUNT_ID` | Pre-selected account ID (optional) | - |
| `ZOOM_IP_SOURCE_URL` | Zoom IP ranges source URL | `https://assets.zoom.us/docs/ipranges/ZoomMeetings.txt` |
| `UPDATE_INTERVAL_HOURS` | Update interval in hours | `24` |
| `MAX_RETRIES` | Max retries for fetching Zoom IPs | `3` |

### Cron Schedule

The default cron schedule is daily at 3 AM UTC. To change this, update the `wrangler.toml`:

```toml
[triggers]
crons = ["0 3 * * *"]  # Daily at 3 AM UTC
```

Examples:
- Every 12 hours: `["0 */12 * * *"]`
- Every 6 hours: `["0 */6 * * *"]`
- Weekly on Monday at 2 AM: `["0 2 * * 1"]`

## How It Works

### Split Tunnel Configuration

The system uses Cloudflare's split tunnel feature in **exclude mode**, which means:

1. **Zoom IPs are excluded from the tunnel**: Traffic to Zoom IPs bypasses the WARP tunnel
2. **All other traffic goes through WARP**: Normal Zero Trust policies apply
3. **Existing configurations are preserved**: Non-Zoom split tunnel entries remain intact

### Update Process

1. **Fetch Zoom IPs**: Retrieves the latest IP ranges from Zoom's official source
2. **Validate IPs**: Ensures all IPs are in valid CIDR notation
3. **Cache IPs**: Stores IPs in KV for quick access
4. **Get WARP Profiles**: Fetches all profiles from the selected account
5. **Merge Configurations**: For each profile:
   - Retrieves existing split tunnel entries
   - Removes old Zoom entries
   - Adds new Zoom entries
   - Preserves all non-Zoom entries
6. **Update Profiles**: Pushes the merged configuration back to Cloudflare
7. **Store Results**: Saves update results and history

## Monitoring

### Logs

Monitor your Worker logs in real-time:

```bash
wrangler tail
```

### Metrics

The system tracks:
- Total profiles updated/failed
- Number of Zoom IPs added
- Processing time
- Error details per profile
- Update history (last 50 updates)

### Alerts

Consider setting up alerts for:
- Failed scheduled updates
- High error rates
- Cloudflare API failures
- Zoom IP source unavailability

## Security Best Practices

### API Token Permissions

Create a token with minimal required permissions:
1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Create Custom Token with:
   - `Account:Cloudflare Zero Trust:Edit`
   - `Account:Account Settings:Read`
3. Limit to specific accounts if possible

### Secrets Management

- Never commit API tokens to version control
- Use `wrangler secret put` to set sensitive values
- Rotate tokens periodically
- Monitor token usage in Cloudflare dashboard

## Troubleshooting

### "No account selected" Error

**Solution**: Select an account first:
```bash
curl -X POST https://your-worker.workers.dev/accounts/select \
  -H "Content-Type: application/json" \
  -d '{"account_id": "your-account-id"}'
```

### "Failed to fetch WARP profiles" Error

**Causes**:
- API token lacks Zero Trust permissions
- Account doesn't have Zero Trust enabled
- Invalid account ID

**Solution**: Verify API token permissions and account access.

### "Failed to fetch Zoom IPs" Error

**Causes**:
- Zoom source URL is down
- Network connectivity issues
- Rate limiting

**Solution**: The system automatically retries with exponential backoff. Check logs for details.

### Scheduled Updates Not Running

**Checks**:
1. Verify cron trigger in `wrangler.toml`
2. Check Worker logs for scheduled events
3. Ensure Worker has sufficient CPU time limits

## Development

### Local Development

```bash
# Start local development server
npm run dev

# Test locally
curl http://localhost:8787/status
```

### Project Structure

```
src/
├── index.ts                      # Main Worker entry point
├── types.ts                      # TypeScript type definitions
└── services/
    ├── cloudflareAPI.ts          # Cloudflare API integration
    ├── zoomIPFetcher.ts          # Zoom IP fetching and parsing
    ├── storageService.ts         # KV storage management
    └── warpProfileManager.ts     # Main orchestration service
```

### Testing

```bash
# Type checking
npx tsc --noEmit

# Run tests (if configured)
npm test

# Dry run deployment
npm run build
```

## Limitations

- **Split Tunnel Limits**: Cloudflare may have limits on the number of split tunnel entries per profile
- **API Rate Limits**: Cloudflare API has rate limits; the system includes delays to prevent hitting them
- **KV Storage**: KV has storage limits; the system stores only necessary data

## FAQ

**Q: Will this overwrite my existing split tunnel configuration?**  
A: No. The system preserves all non-Zoom split tunnel entries and only updates Zoom-related entries.

**Q: How often are Zoom IPs updated?**  
A: By default, daily at 3 AM UTC. You can change this in `wrangler.toml` or trigger manual updates anytime.

**Q: Can I manage multiple accounts?**  
A: Yes. You can switch between accounts using the `/accounts/select` endpoint.

**Q: What happens if the Zoom IP source is unavailable?**  
A: The system will retry up to 3 times with exponential backoff. If all retries fail, it will use cached IPs if available.

**Q: Is KV storage required?**  
A: No, but it's highly recommended for caching Zoom IPs and storing update history.

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Cloudflare Workers documentation
3. Check Cloudflare Zero Trust API documentation
4. Review Zoom IP ranges documentation

## Changelog

### v1.0.0
- Initial release
- Automatic Zoom IP fetching
- Multi-account support
- WARP profile split tunnel management
- Scheduled updates
- Update history tracking
- RESTful API
