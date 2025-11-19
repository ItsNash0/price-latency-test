# Bitcoin Price Comparison - Binance vs Chainlink

Real-time Bitcoin price comparison showing data from both Binance WebSocket and Polymarket's Chainlink oracle feed.

## Features

- **Real-time Binance Prices**: Direct WebSocket connection to Binance for live BTC/USDT trade prices
- **Chainlink Oracle Data**: BTC/USD prices from Polymarket's Chainlink feed via their real-time-data-client
- **Overlapping Charts**: Visual comparison of both price feeds on the same timeline
- **Divergence Tracking**: Real-time calculation of price differences between the two sources
- **Auto-reconnection**: Automatic reconnection if connections drop

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## How It Works

### Binance WebSocket
Connects directly to Binance's trade stream for BTC/USDT:
- Endpoint: `wss://stream.binance.com:9443/ws/btcusdt@trade`
- Updates on every trade execution
- Provides spot market prices

### Polymarket Chainlink Feed
Uses the `@polymarket/real-time-data-client` to subscribe to:
- Topic: `crypto_prices_chainlink`
- Symbol: `BTC`
- Provides oracle-aggregated prices

### Divergence Analysis
The app calculates:
- Absolute price difference in USD
- Percentage difference
- Color-coded divergence indicator (green < 0.1%, yellow < 0.5%, red > 0.5%)

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Recharts** - Data visualization
- **WebSocket** - Real-time data connections
- **Polymarket Real-Time Data Client** - Chainlink price feed

## License

MIT

