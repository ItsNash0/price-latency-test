# Bitcoin Price Latency Test

Real-time Bitcoin price comparison showing which data source reflects price changes first: Binance Trade, Binance Aggregated Trades, or Polymarket's Chainlink oracle feed.

## 🎯 Purpose

Analyze price discovery and latency by comparing:
- **Binance Individual Trades** - Granular trade-by-trade data
- **Binance Aggregated Trades** - Combined trades for charting
- **Chainlink Oracle** (via Polymarket) - Decentralized price feed

## 🏗️ Architecture

### Server-Side WebSocket Connections
All WebSocket connections are handled **server-side** via Next.js API routes:
- `/api/binance-trade` - Connects to Binance trade stream
- `/api/binance-agg` - Connects to Binance aggregated trade stream  
- `/api/chainlink` - Connects to Polymarket's Chainlink feed

### Server-Sent Events (SSE)
The server streams price data to the client using SSE, which:
- ✅ Provides accurate server-side timestamps
- ✅ Enables deployment close to exchange servers for minimal latency
- ✅ Measures true network latency (server→client)
- ✅ Auto-reconnects on connection loss

### Benefits
1. **Accurate Latency Measurements** - Server timestamps eliminate client-side delays
2. **Geographic Optimization** - Deploy near exchanges (e.g., AWS Singapore for Binance)
3. **Lower Infrastructure Load** - Server manages persistent WebSocket connections
4. **Better Reliability** - Server-side reconnection logic

## 🚀 Getting Started

### Local Development

#### Install Dependencies
```bash
npm install
```

#### Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

#### Build for Production
```bash
npm run build
npm start
```

### Deploy to Coolify

[![Deploy to Coolify](https://img.shields.io/badge/Deploy%20to-Coolify-6C47FF?style=for-the-badge)](DEPLOYMENT.md)

This project is fully compatible with Coolify and Nixpacks. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

**Quick Deploy:**
1. Connect your Coolify instance to this GitHub repository
2. Coolify auto-detects Next.js and uses the included `nixpacks.toml`
3. Deploy! No additional configuration needed.

The project includes:
- ✅ `nixpacks.toml` for automated build configuration
- ✅ Standalone Next.js output for optimal container performance
- ✅ Dynamic port binding for Coolify compatibility
- ✅ Automatic WebSocket connection management

## 📊 Features

### Real-Time Price Feeds
- 🔵 **Binance Trade** - Every individual trade
- 🔷 **Binance Agg** - Aggregated trades
- 🟢 **Chainlink** - Oracle-aggregated price

### Leader Detection
- ⚡ Highlights which source changes price first
- 📈 Tracks significant price movements (>0.01%)
- ⏱️ Shows millisecond-level timing differences

### Latency Monitoring
- Server→Client latency displayed for each feed
- Real-time connection status indicators
- Auto-reconnection on disconnects

### Visual Analysis
- Overlapping price charts for direct comparison
- Color-coded price sources
- Interactive tooltips with precise values

## 🌍 Deployment Recommendations

### For Lowest Latency

1. **Binance** - Deploy in Singapore region
   - Binance servers are primarily in Singapore
   - AWS: `ap-southeast-1`
   - Vercel: Singapore region

2. **Polymarket/Chainlink** - Deploy in US East
   - Polymarket websocket: `wss://ws-live-data.polymarket.com`
   - AWS: `us-east-1`
   - Vercel: Washington D.C region

### Deployment Platforms
- **Vercel** - Easy deployment with geographic edge functions
- **AWS ECS/Lambda** - Full control over server location
- **Railway** - Simple deployment with region selection

## 📈 What You'll Discover

This tool helps answer:
- Which exchange/oracle updates prices first?
- How much latency exists between sources?
- Are aggregated trades faster than individual trades?
- How does Chainlink oracle lag compare to spot exchanges?

## 🛠️ Technical Stack

- **Next.js 14** - React framework with API routes
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **ws** - Server-side WebSocket library
- **Server-Sent Events** - Real-time data streaming

## 📝 API Routes

### GET /api/binance-trade
Streams Binance individual trades via SSE
```
data: {"type":"price","source":"binance_trade","price":92589.50,"serverTimestamp":1700000000000}
```

### GET /api/binance-agg
Streams Binance aggregated trades via SSE
```
data: {"type":"price","source":"binance_agg","price":92589.51,"serverTimestamp":1700000000000}
```

### GET /api/chainlink
Streams Polymarket Chainlink BTC/USD prices via SSE
```
data: {"type":"price","source":"chainlink","price":92589.45,"serverTimestamp":1700000000000}
```

## 🔧 Configuration

The server automatically:
- Reconnects on disconnection
- Sends PING/PONG for Polymarket keepalive
- Filters significant price changes
- Manages multiple concurrent client connections

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! This is a research tool for understanding cryptocurrency price discovery mechanisms.
