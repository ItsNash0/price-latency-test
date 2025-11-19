import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BTC Price Comparison - Binance vs Chainlink',
  description: 'Real-time Bitcoin price comparison between Binance and Polymarket Chainlink feed',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

