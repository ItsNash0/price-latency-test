# Deployment Guide for Coolify

This guide covers deploying the Bitcoin Price Latency Test to Coolify using Nixpacks.

## Prerequisites

- A Coolify instance (self-hosted or cloud)
- GitHub repository access
- Domain name (optional, Coolify provides one)

## Quick Deploy to Coolify

### 1. Create New Application

1. Log into your Coolify dashboard
2. Click **"New Resource"** → **"Application"**
3. Select **"Public Repository"**
4. Enter repository URL: `https://github.com/ItsNash0/price-latency-test`
5. Select the `main` branch

### 2. Configure Build Settings

Coolify will auto-detect Next.js and use Nixpacks. The included `nixpacks.toml` ensures proper configuration.

**Build Settings (Auto-configured):**
- **Build Pack:** Nixpacks (auto-detected)
- **Node Version:** 20.x (specified in nixpacks.toml)
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm start`

### 3. Environment Variables

No environment variables are required for basic operation. The app will use:
- `PORT` - Automatically set by Coolify
- `NODE_ENV=production` - Set automatically

### 4. Port Configuration

**Port:** The app listens on the port specified by Coolify's `PORT` environment variable (default: 3000)

Coolify will automatically:
- Expose the correct port
- Configure the reverse proxy
- Set up SSL/HTTPS

### 5. Deploy

1. Click **"Deploy"**
2. Monitor build logs
3. Once deployed, access via the provided URL

## Regional Optimization

For best latency measurements, deploy in regions close to the exchanges:

### Recommended Regions

**Binance (Singapore):**
- Hetzner: Falkenstein, Germany (closest EU)
- DigitalOcean: Singapore
- AWS: ap-southeast-1 (Singapore)

**Polymarket (US East):**
- Hetzner: Ashburn, USA
- DigitalOcean: New York
- AWS: us-east-1 (N. Virginia)

### Deploy Multiple Instances

For comprehensive latency testing, deploy two instances:

1. **Instance 1:** Near Singapore (for Binance)
   - Best for Binance trade/agg latency
   
2. **Instance 2:** US East (for Polymarket)
   - Best for Chainlink oracle latency

## Coolify Configuration

### nixpacks.toml
```toml
[phases.setup]
nixPkgs = ['nodejs_20']

[phases.install]
cmds = ['npm ci']

[phases.build]
cmds = ['npm run build']

[start]
cmd = 'npm start'
```

This file is included in the repository and will be automatically used by Coolify.

### next.config.js
The Next.js config includes:
- `output: 'standalone'` - Optimized for containerized deployments
- WebSocket support enabled
- Production optimizations

## Health Checks

Coolify will automatically configure health checks. The app responds on:
- **URL:** `/` (main page)
- **Expected:** 200 status code
- **Timeout:** 30 seconds

## Scaling

### Horizontal Scaling
Each instance maintains its own WebSocket connections. You can run multiple instances behind a load balancer, but note:
- Each instance will have independent WebSocket connections
- SSE connections are stateful (client → specific instance)

### Vertical Scaling
Recommended minimum:
- **CPU:** 0.5 vCPU
- **RAM:** 512 MB
- **Storage:** 1 GB

For production with multiple concurrent users:
- **CPU:** 1-2 vCPU
- **RAM:** 1-2 GB

## Monitoring

### Server Logs
Access via Coolify dashboard → Application → Logs

Key log messages to monitor:
```
[Server] Binance Trade WebSocket connected
[Server] Binance Agg WebSocket connected
[Server] Polymarket WebSocket connected
[Server] Client disconnected from X stream
```

### Connection Issues
If WebSocket connections fail:
1. Check firewall rules allow outbound WebSocket connections
2. Verify network connectivity to exchanges
3. Check server logs for specific errors

## Troubleshooting

### Build Fails
```bash
# Ensure Node.js 18+ is being used
# Check nixpacks.toml specifies nodejs_20
```

### WebSocket Connection Issues
```bash
# Test WebSocket connectivity from server
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  wss://stream.binance.com:9443/ws/btcusdt@trade
```

### High Memory Usage
If memory usage is high:
1. Increase RAM allocation in Coolify
2. Monitor number of concurrent client connections
3. Check for memory leaks in server logs

## SSL/HTTPS

Coolify automatically provisions SSL certificates via Let's Encrypt. Ensure:
- Domain is properly configured
- DNS is pointing to Coolify server
- Port 80/443 are open

## Updates

To update the deployment:

1. **Automatic (Webhook):**
   - Configure GitHub webhook in Coolify
   - Push to `main` branch
   - Coolify auto-deploys

2. **Manual:**
   - Go to Coolify dashboard
   - Click **"Redeploy"**

## Production Checklist

- [ ] Repository connected to Coolify
- [ ] Build completes successfully
- [ ] All three WebSocket streams connect
- [ ] SSE streams work from client
- [ ] SSL/HTTPS enabled
- [ ] Domain configured (optional)
- [ ] Health checks passing
- [ ] Logs show no errors
- [ ] Test from client browser

## Performance

Expected performance metrics:
- **Build Time:** 2-3 minutes
- **Cold Start:** < 5 seconds
- **Memory Usage:** 100-300 MB (idle)
- **CPU Usage:** < 5% (idle), spikes during WebSocket data processing

## Support

For issues specific to:
- **Coolify:** Check Coolify documentation
- **Application:** Open GitHub issue
- **WebSocket Feeds:** Check exchange status pages

