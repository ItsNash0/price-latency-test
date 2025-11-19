'use client'

import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PricePoint {
  timestamp: number
  binancePrice: number | null
  binanceAggPrice: number | null
  chainlinkPrice: number | null
  time: string
}

const MAX_DATA_POINTS = 100

export default function Home() {
  const [priceData, setPriceData] = useState<PricePoint[]>([])
  const [binanceStatus, setBinanceStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [binanceAggStatus, setBinanceAggStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [chainlinkStatus, setChainlinkStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [currentBinancePrice, setCurrentBinancePrice] = useState<number | null>(null)
  const [currentBinanceAggPrice, setCurrentBinanceAggPrice] = useState<number | null>(null)
  const [currentChainlinkPrice, setCurrentChainlinkPrice] = useState<number | null>(null)
  const [divergence, setDivergence] = useState<number | null>(null)
  const [lastPolymarketMessage, setLastPolymarketMessage] = useState<string>('')
  const [messageCount, setMessageCount] = useState({ binance: 0, polymarket: 0 })
  const [lastBinanceUpdate, setLastBinanceUpdate] = useState<number | null>(null)
  const [lastBinanceAggUpdate, setLastBinanceAggUpdate] = useState<number | null>(null)
  const [lastChainlinkUpdate, setLastChainlinkUpdate] = useState<number | null>(null)
  const [priceLeader, setPriceLeader] = useState<'binance' | 'binance_agg' | 'chainlink' | 'equal' | null>(null)
  const [lastBinanceChange, setLastBinanceChange] = useState<number | null>(null)
  const [lastBinanceAggChange, setLastBinanceAggChange] = useState<number | null>(null)
  const [lastChainlinkChange, setLastChainlinkChange] = useState<number | null>(null)
  
  const binanceWsRef = useRef<WebSocket | null>(null)
  const binanceAggWsRef = useRef<WebSocket | null>(null)
  const polymarketClientRef = useRef<any>(null)
  const polymarketPingRef = useRef<NodeJS.Timeout | null>(null)
  const hasConnectedRef = useRef(false)

  useEffect(() => {
    // Prevent double connection in React StrictMode
    if (hasConnectedRef.current) return
    hasConnectedRef.current = true

    // Connect to Binance WebSocket
    const connectBinance = () => {
      try {
        const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade')
        binanceWsRef.current = ws

        ws.onopen = () => {
          console.log('Binance WebSocket connected')
          setBinanceStatus('connected')
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          const price = parseFloat(data.p)
          const timestamp = Date.now()
          
          setMessageCount(prev => ({ ...prev, binance: prev.binance + 1 }))
          setLastBinanceUpdate(timestamp)
          
          // Track significant price changes (> 0.01%)
          setCurrentBinancePrice(prevPrice => {
            if (prevPrice && Math.abs((price - prevPrice) / prevPrice) > 0.0001) {
              setLastBinanceChange(timestamp)
            }
            return price
          })
          
          setPriceData(prev => {
            const newData = [...prev]
            const lastPoint = newData[newData.length - 1]
            
            // Always add first point
            if (newData.length === 0) {
              return [{
                timestamp,
                binancePrice: price,
                binanceAggPrice: null,
                chainlinkPrice: null,
                time: new Date(timestamp).toLocaleTimeString()
              }]
            }
            
            // Add new point every 1 second for smoother updates
            if (timestamp - lastPoint.timestamp > 1000) {
              newData.push({
                timestamp,
                binancePrice: price,
                binanceAggPrice: lastPoint.binanceAggPrice,
                chainlinkPrice: lastPoint.chainlinkPrice,
                time: new Date(timestamp).toLocaleTimeString()
              })
            } else {
              // Update existing point
              lastPoint.binancePrice = price
            }
            
            // Keep only last MAX_DATA_POINTS
            return newData.slice(-MAX_DATA_POINTS)
          })
        }

        ws.onerror = (error) => {
          console.error('Binance WebSocket error:', error)
          setBinanceStatus('disconnected')
        }

        ws.onclose = () => {
          console.log('Binance WebSocket disconnected')
          setBinanceStatus('disconnected')
          // Reconnect after 3 seconds
          setTimeout(connectBinance, 3000)
        }
      } catch (error) {
        console.error('Failed to connect to Binance:', error)
        setBinanceStatus('disconnected')
      }
    }

    // Connect directly to Polymarket WebSocket
    const connectPolymarket = () => {
      try {
        const ws = new WebSocket('wss://ws-live-data.polymarket.com')
        polymarketClientRef.current = ws

        ws.onopen = () => {
          console.log('🔌 Polymarket WebSocket connected')
          setChainlinkStatus('connected')
          
          // Subscribe to BTC/USD chainlink prices
          const subscribeMessage = {
            action: 'subscribe',
            subscriptions: [
              {
                topic: 'crypto_prices_chainlink',
                type: '*',
                filters: '{"symbol":"btc/usd"}'
              }
            ]
          }
          
          console.log('📤 Subscribing to btc/usd chainlink updates:', JSON.stringify(subscribeMessage, null, 2))
          ws.send(JSON.stringify(subscribeMessage))
          
          // Start sending PING messages every 5 seconds
          polymarketPingRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              console.log('💓 Sending PING to Polymarket')
              ws.send(JSON.stringify({ type: 'ping' }))
            }
          }, 5000)
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('🔔 RAW Polymarket message:', message)
            
            setMessageCount(prev => ({ ...prev, polymarket: prev.polymarket + 1 }))
            
            // Only show non-system messages in debug
            if (message.topic || message.type) {
              setLastPolymarketMessage(JSON.stringify(message, null, 2))
            }
            
            // Handle pong messages
            if (message.type === 'pong') {
              console.log('💓 Received PONG from Polymarket')
              return
            }
            
            // Check if this is a price update message
            if (message.topic === 'crypto_prices_chainlink' && message.type === 'update') {
              console.log('✅ Got chainlink price update!')
              const payload = message.payload
              console.log('Chainlink payload:', payload)
              
              if (payload && payload.symbol === 'btc/usd' && payload.value) {
                const price = typeof payload.value === 'number' ? payload.value : parseFloat(payload.value)
                const timestamp = Date.now()
                
                console.log(`✅✅✅ SETTING CHAINLINK PRICE: ${price} ✅✅✅`)
                
                setLastChainlinkUpdate(timestamp)
                
                // Track significant price changes (> 0.01%)
                setCurrentChainlinkPrice(prevPrice => {
                  if (prevPrice && Math.abs((price - prevPrice) / prevPrice) > 0.0001) {
                    setLastChainlinkChange(timestamp)
                  }
                  return price
                })
                
                // Update chart data
                setPriceData(prev => {
                  const newData = [...prev]
                  const lastPoint = newData[newData.length - 1]
                  
                  // Always add a new point if no data exists
                  if (newData.length === 0) {
                  return [{
                    timestamp,
                    binancePrice: null,
                    binanceAggPrice: null,
                    chainlinkPrice: price,
                    time: new Date(timestamp).toLocaleTimeString()
                  }]
                }
                
                // Update the last point with chainlink price (merge data)
                lastPoint.chainlinkPrice = price
                  
                  // Keep only last MAX_DATA_POINTS
                  const result = newData.slice(-MAX_DATA_POINTS)
                  console.log(`📊 Chart data updated. Total points: ${result.length}, Last point:`, result[result.length - 1])
                  return result
                })
              } else if (payload) {
                console.log('❌ Symbol mismatch or no value. Expected: btc/usd, Got:', payload?.symbol, 'Value:', payload?.value)
              } else {
                console.log('❌ No payload in message')
              }
            } else if (message.topic || message.type) {
              console.log('ℹ️ Non-price message - topic:', message.topic, 'type:', message.type)
            } else {
              console.log('ℹ️ System/connection message')
            }
          } catch (error) {
            console.error('Error parsing Polymarket message:', error)
          }
        }

        ws.onerror = (error) => {
          console.error('Polymarket WebSocket error:', error)
          setChainlinkStatus('disconnected')
        }

        ws.onclose = () => {
          console.log('Polymarket WebSocket disconnected')
          setChainlinkStatus('disconnected')
          
          // Clear ping interval
          if (polymarketPingRef.current) {
            clearInterval(polymarketPingRef.current)
            polymarketPingRef.current = null
          }
          
          // Reconnect after 3 seconds
          setTimeout(connectPolymarket, 3000)
        }
      } catch (error) {
        console.error('Failed to connect to Polymarket:', error)
        setChainlinkStatus('disconnected')
      }
    }

    // Connect to Binance Aggregated Trades WebSocket
    const connectBinanceAgg = () => {
      try {
        const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@aggTrade')
        binanceAggWsRef.current = ws

        ws.onopen = () => {
          console.log('Binance AggTrade WebSocket connected')
          setBinanceAggStatus('connected')
        }

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          const price = parseFloat(data.p)
          const timestamp = Date.now()
          
          setLastBinanceAggUpdate(timestamp)
          
          // Track significant price changes (> 0.01%)
          setCurrentBinanceAggPrice(prevPrice => {
            if (prevPrice && Math.abs((price - prevPrice) / prevPrice) > 0.0001) {
              setLastBinanceAggChange(timestamp)
            }
            return price
          })
          
          setPriceData(prev => {
            const newData = [...prev]
            const lastPoint = newData[newData.length - 1]
            
            // Always add first point
            if (newData.length === 0) {
              return [{
                timestamp,
                binancePrice: null,
                binanceAggPrice: price,
                chainlinkPrice: null,
                time: new Date(timestamp).toLocaleTimeString()
              }]
            }
            
            // Add new point every 1 second for smoother updates
            if (timestamp - lastPoint.timestamp > 1000) {
              newData.push({
                timestamp,
                binancePrice: lastPoint.binancePrice,
                binanceAggPrice: price,
                chainlinkPrice: lastPoint.chainlinkPrice,
                time: new Date(timestamp).toLocaleTimeString()
              })
            } else {
              // Update existing point
              lastPoint.binanceAggPrice = price
            }
            
            // Keep only last MAX_DATA_POINTS
            return newData.slice(-MAX_DATA_POINTS)
          })
        }

        ws.onerror = (error) => {
          console.error('Binance AggTrade WebSocket error:', error)
          setBinanceAggStatus('disconnected')
        }

        ws.onclose = () => {
          console.log('Binance AggTrade WebSocket disconnected')
          setBinanceAggStatus('disconnected')
          // Reconnect after 3 seconds
          setTimeout(connectBinanceAgg, 3000)
        }
      } catch (error) {
        console.error('Failed to connect to Binance AggTrade:', error)
        setBinanceAggStatus('disconnected')
      }
    }

    connectBinance()
    connectBinanceAgg()
    connectPolymarket()

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up connections...')
      hasConnectedRef.current = false
      
      if (binanceWsRef.current) {
        binanceWsRef.current.close()
        binanceWsRef.current = null
      }
      if (binanceAggWsRef.current) {
        binanceAggWsRef.current.close()
        binanceAggWsRef.current = null
      }
      if (polymarketClientRef.current) {
        polymarketClientRef.current.close()
        polymarketClientRef.current = null
      }
      if (polymarketPingRef.current) {
        clearInterval(polymarketPingRef.current)
        polymarketPingRef.current = null
      }
    }
  }, [])

  // Calculate divergence and determine leader
  useEffect(() => {
    if (currentBinancePrice && currentChainlinkPrice) {
      const diff = currentBinancePrice - currentChainlinkPrice
      const percentDiff = (diff / currentBinancePrice) * 100
      setDivergence(percentDiff)
    }
    
    // Determine which source is leading based on most recent price change
    const changes = [
      { source: 'binance' as const, time: lastBinanceChange },
      { source: 'binance_agg' as const, time: lastBinanceAggChange },
      { source: 'chainlink' as const, time: lastChainlinkChange }
    ].filter(c => c.time !== null) as { source: 'binance' | 'binance_agg' | 'chainlink', time: number }[]
    
    if (changes.length > 1) {
      const sorted = changes.sort((a, b) => b.time - a.time)
      const timeDiff = sorted[0].time - sorted[1].time
      
      if (timeDiff < 100) { // Within 100ms, consider equal
        setPriceLeader('equal')
      } else {
        setPriceLeader(sorted[0].source)
      }
    }
  }, [currentBinancePrice, currentBinanceAggPrice, currentChainlinkPrice, lastBinanceChange, lastBinanceAggChange, lastChainlinkChange])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500'
      case 'connecting': return 'bg-yellow-500'
      case 'disconnected': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <p className="text-white text-sm mb-2">{payload[0].payload.time}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: ${entry.value?.toFixed(2) || 'N/A'}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Bitcoin Price Comparison
        </h1>
        <p className="text-gray-300 text-center mb-8">
          Real-time comparison between Binance and Polymarket Chainlink feed
        </p>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className={`bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border ${
            priceLeader === 'binance' ? 'border-blue-500 shadow-lg shadow-blue-500/50' : 'border-gray-700'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm flex items-center gap-2">
                Binance Trade
                {priceLeader === 'binance' && <span className="text-blue-400 text-xs">⚡</span>}
              </span>
              <div className={`w-3 h-3 rounded-full ${getStatusColor(binanceStatus)}`}></div>
            </div>
            <p className="text-3xl font-bold text-white">
              ${currentBinancePrice?.toFixed(2) || '---'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {lastBinanceUpdate ? `${Math.round((Date.now() - lastBinanceUpdate) / 1000)}s ago` : 'Connecting...'}
            </p>
          </div>

          <div className={`bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border ${
            priceLeader === 'binance_agg' ? 'border-cyan-500 shadow-lg shadow-cyan-500/50' : 'border-gray-700'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm flex items-center gap-2">
                Binance Agg
                {priceLeader === 'binance_agg' && <span className="text-cyan-400 text-xs">⚡</span>}
              </span>
              <div className={`w-3 h-3 rounded-full ${getStatusColor(binanceAggStatus)}`}></div>
            </div>
            <p className="text-3xl font-bold text-white">
              ${currentBinanceAggPrice?.toFixed(2) || '---'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {lastBinanceAggUpdate ? `${Math.round((Date.now() - lastBinanceAggUpdate) / 1000)}s ago` : 'Connecting...'}
            </p>
          </div>

          <div className={`bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border ${
            priceLeader === 'chainlink' ? 'border-green-500 shadow-lg shadow-green-500/50' : 'border-gray-700'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm flex items-center gap-2">
                Chainlink
                {priceLeader === 'chainlink' && <span className="text-green-400 text-xs">⚡</span>}
              </span>
              <div className={`w-3 h-3 rounded-full ${getStatusColor(chainlinkStatus)}`}></div>
            </div>
            <p className="text-3xl font-bold text-white">
              ${currentChainlinkPrice?.toFixed(2) || '---'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {lastChainlinkUpdate ? `${Math.round((Date.now() - lastChainlinkUpdate) / 1000)}s ago` : 'Connecting...'}
            </p>
          </div>

          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Leader</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {priceLeader === 'binance' && '🔵 Binance Trade'}
              {priceLeader === 'binance_agg' && '🔷 Binance Agg'}
              {priceLeader === 'chainlink' && '🟢 Chainlink'}
              {priceLeader === 'equal' && '⚪ Equal'}
              {!priceLeader && '⏳ Waiting...'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {priceLeader && priceLeader !== 'equal' ? 'Most recent price change' : 'Price discovery'}
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">
            Price Overlay - Last {priceData.length} Points
          </h2>
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time" 
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
              />
              <YAxis 
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                domain={['auto', 'auto']}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ color: '#fff' }}
                iconType="line"
              />
              <Line 
                type="monotone" 
                dataKey="binancePrice" 
                stroke="#3B82F6" 
                name="Binance Trade"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line 
                type="monotone" 
                dataKey="binanceAggPrice" 
                stroke="#06B6D4" 
                name="Binance Agg"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line 
                type="monotone" 
                dataKey="chainlinkPrice" 
                stroke="#10B981" 
                name="Chainlink"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Debug Section */}
        <div className="mt-8 bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Debug Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 mb-2">
                Binance Messages: <span className="text-blue-400 font-mono">{messageCount.binance}</span>
              </p>
              <p className="text-gray-400 mb-2">
                Polymarket Messages: <span className="text-green-400 font-mono">{messageCount.polymarket}</span>
              </p>
            </div>
            <div>
              <p className="text-gray-400 mb-2">Last Polymarket Message:</p>
              <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
                {lastPolymarketMessage || 'Waiting for messages...'}
              </pre>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">About</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <p className="font-semibold text-blue-400 mb-1">Binance WebSocket</p>
              <p>Real-time BTC/USDT trade prices from Binance exchange via WebSocket connection.</p>
            </div>
            <div>
              <p className="font-semibold text-green-400 mb-1">Chainlink Price Feed</p>
              <p>BTC/USD prices from Polymarket's Chainlink oracle feed, providing decentralized price data.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

