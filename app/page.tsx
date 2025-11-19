'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

interface PricePoint {
  timestamp: number
  binanceAggPrice: number | null
  chainlinkPrice: number | null
  polymarketUpPrice: number | null
  polymarketDownPrice: number | null
  binanceAggChange: number | null
  chainlinkChange: number | null
  polymarketUpChange: number | null
  polymarketDownChange: number | null
  time: string
}

interface MovementEvent {
  source: 'binance_agg' | 'chainlink'
  timestamp: number
  percentChange: number
  direction: 'up' | 'down'
}

interface TradingSignal {
  action: 'LONG' | 'SHORT' | 'NEUTRAL'
  strength: number // 0-100
  reason: string
  timestamp: number
  binanceChange: number
  expectedChainlinkMove: boolean
}

const MAX_DATA_POINTS = 100

export default function Home() {
  const [priceData, setPriceData] = useState<PricePoint[]>([])
  const [binanceAggStatus, setBinanceAggStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [chainlinkStatus, setChainlinkStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [currentBinanceAggPrice, setCurrentBinanceAggPrice] = useState<number | null>(null)
  const [currentChainlinkPrice, setCurrentChainlinkPrice] = useState<number | null>(null)
  const [lastBinanceAggUpdate, setLastBinanceAggUpdate] = useState<number | null>(null)
  const [lastChainlinkUpdate, setLastChainlinkUpdate] = useState<number | null>(null)
  const [priceLeader, setPriceLeader] = useState<'binance_agg' | 'chainlink' | 'equal' | null>(null)
  const [lastBinanceAggChange, setLastBinanceAggChange] = useState<number | null>(null)
  const [lastChainlinkChange, setLastChainlinkChange] = useState<number | null>(null)
  const [serverLatency, setServerLatency] = useState<{ binance_agg: number | null, chainlink: number | null }>({
    binance_agg: null,
    chainlink: null
  })
  const [previousPrices, setPreviousPrices] = useState<{ binance_agg: number | null, chainlink: number | null }>({
    binance_agg: null,
    chainlink: null
  })
  const [movementEvents, setMovementEvents] = useState<MovementEvent[]>([])
  const [movementDivergence, setMovementDivergence] = useState<{
    binanceVsChainlink: number | null
    binanceAggVsChainlink: number | null
    leader: string | null
  }>({
    binanceVsChainlink: null,
    binanceAggVsChainlink: null,
    leader: null
  })
  const [tradingSignal, setTradingSignal] = useState<TradingSignal>({
    action: 'NEUTRAL',
    strength: 0,
    reason: 'Waiting for data...',
    timestamp: Date.now(),
    binanceChange: 0,
    expectedChainlinkMove: false
  })
  const [lastBinanceAggMovement, setLastBinanceAggMovement] = useState<{ timestamp: number, percentChange: number, direction: 'up' | 'down' } | null>(null)
  const [chainlinkRespondedTo, setChainlinkRespondedTo] = useState<number | null>(null)
  const [orderbookStatus, setOrderbookStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [orderbookPrice, setOrderbookPrice] = useState<{ up: number | null, down: number | null }>({ up: null, down: null })
  const [lastOrderbookUpdate, setLastOrderbookUpdate] = useState<number | null>(null)
  const [orderbookMovement, setOrderbookMovement] = useState<string>('')
  const [previousOrderbookPrices, setPreviousOrderbookPrices] = useState<{ up: number | null, down: number | null }>({ up: null, down: null })
  const [marketOpenPrice, setMarketOpenPrice] = useState<number | null>(null)
  const [marketInfo, setMarketInfo] = useState<{ eventStartTime: string, endDate: string } | null>(null)

  useEffect(() => {
    // Connect to Binance Agg SSE
    const binanceAggEventSource = new EventSource('/api/binance-agg')
    
    binanceAggEventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'status') {
          setBinanceAggStatus(message.status)
        } else if (message.type === 'price') {
          const clientTimestamp = Date.now()
          const latency = clientTimestamp - message.serverTimestamp
          
          setServerLatency(prev => ({ ...prev, binance_agg: latency }))
          setLastBinanceAggUpdate(clientTimestamp)
          
          setCurrentBinanceAggPrice(prevPrice => {
            const percentChange = prevPrice ? ((message.price - prevPrice) / prevPrice) * 100 : 0
            
            // Track significant movements (> 0.01%)
            if (prevPrice && Math.abs(percentChange) > 0.01) {
              setLastBinanceAggChange(clientTimestamp)
              
              // Record movement event
              setMovementEvents(prev => [...prev.slice(-50), {
                source: 'binance_agg',
                timestamp: clientTimestamp,
                percentChange,
                direction: percentChange > 0 ? 'up' : 'down'
              }])
              
              // Record as potential lead movement for signals
              setLastBinanceAggMovement({
                timestamp: clientTimestamp,
                percentChange,
                direction: percentChange > 0 ? 'up' : 'down'
              })
            }
            
            setPreviousPrices(prev => ({ ...prev, binance_agg: prevPrice }))
            updatePriceData('binanceAggPrice', message.price, clientTimestamp, percentChange)
            return message.price
          })
        }
      } catch (error) {
        console.error('[Client] Binance Agg parse error:', error)
      }
    }

    binanceAggEventSource.onerror = () => {
      console.error('[Client] Binance Agg stream error')
      setBinanceAggStatus('disconnected')
    }

    // Connect to Chainlink SSE
    const chainlinkEventSource = new EventSource('/api/chainlink')
    
    chainlinkEventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'status') {
          setChainlinkStatus(message.status)
        } else if (message.type === 'price') {
          const clientTimestamp = Date.now()
          const latency = clientTimestamp - message.serverTimestamp
          
          setServerLatency(prev => ({ ...prev, chainlink: latency }))
          setLastChainlinkUpdate(clientTimestamp)
          
          setCurrentChainlinkPrice(prevPrice => {
            const percentChange = prevPrice ? ((message.price - prevPrice) / prevPrice) * 100 : 0
            
            // Track significant movements (> 0.01%)
            if (prevPrice && Math.abs(percentChange) > 0.01) {
              setLastChainlinkChange(clientTimestamp)
              
              // Record movement event
              setMovementEvents(prev => [...prev.slice(-50), {
                source: 'chainlink',
                timestamp: clientTimestamp,
                percentChange,
                direction: percentChange > 0 ? 'up' : 'down'
              }])
              
              // Mark that Chainlink responded to Binance movement
              setChainlinkRespondedTo(clientTimestamp)
            }
            
            setPreviousPrices(prev => ({ ...prev, chainlink: prevPrice }))
            updatePriceData('chainlinkPrice', message.price, clientTimestamp, percentChange)
            return message.price
          })
        }
      } catch (error) {
        console.error('[Client] Chainlink parse error:', error)
      }
    }

    chainlinkEventSource.onerror = () => {
      console.error('[Client] Chainlink stream error')
      setChainlinkStatus('disconnected')
    }

    // Connect to Polymarket Orderbook SSE
    const orderbookEventSource = new EventSource('/api/polymarket-orderbook')
    
    orderbookEventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'status') {
          setOrderbookStatus(message.status)
          
          // Store market open price for reference line
          if (message.openPrice) {
            setMarketOpenPrice(message.openPrice)
            setMarketInfo({
              eventStartTime: message.eventStartTime,
              endDate: message.endDate
            })
            console.log('[Client] Market Open Price:', message.openPrice)
          }
        } else if (message.type === 'price_change') {
          const clientTimestamp = Date.now()
          setLastOrderbookUpdate(clientTimestamp)
          
          console.log('[Client] 📊 Orderbook price change:', message)
          
          // Update UP price if present
          if (message.upPrice !== null && message.upPrice !== undefined) {
            const prevPrice = previousOrderbookPrices.up
            const percentChange = prevPrice ? ((message.upPrice - prevPrice) / prevPrice) * 100 : 0
            
            console.log(`[Client] 🟢 UP price: ${message.upPrice}, change: ${percentChange.toFixed(3)}%`)
            
            setOrderbookPrice(prev => ({ ...prev, up: message.upPrice }))
            setPreviousOrderbookPrices(prev => ({ ...prev, up: prevPrice }))
            updateOrderbookData('polymarketUpPrice', message.upPrice, clientTimestamp, percentChange)
          }
          
          // Update DOWN price if present
          if (message.downPrice !== null && message.downPrice !== undefined) {
            const prevPrice = previousOrderbookPrices.down
            const percentChange = prevPrice ? ((message.downPrice - prevPrice) / prevPrice) * 100 : 0
            
            console.log(`[Client] 🔴 DOWN price: ${message.downPrice}, change: ${percentChange.toFixed(3)}%`)
            
            setOrderbookPrice(prev => ({ ...prev, down: message.downPrice }))
            setPreviousOrderbookPrices(prev => ({ ...prev, down: prevPrice }))
            updateOrderbookData('polymarketDownPrice', message.downPrice, clientTimestamp, percentChange)
          }
          
          if (message.upPrice || message.downPrice) {
            setOrderbookMovement(`UP: ${message.upPrice?.toFixed(3) || '---'} | DOWN: ${message.downPrice?.toFixed(3) || '---'}`)
          }
        }
      } catch (error) {
        console.error('[Client] Polymarket Orderbook parse error:', error)
      }
    }

    orderbookEventSource.onerror = () => {
      console.error('[Client] Polymarket Orderbook stream error')
      setOrderbookStatus('disconnected')
    }

    // Cleanup
    return () => {
      binanceAggEventSource.close()
      chainlinkEventSource.close()
      orderbookEventSource.close()
    }
  }, [])

  const updatePriceData = (
    field: 'binanceAggPrice' | 'chainlinkPrice', 
    price: number, 
    timestamp: number,
    percentChange: number
  ) => {
    const changeField = field === 'binanceAggPrice' ? 'binanceAggChange' : 'chainlinkChange'
    
    setPriceData(prev => {
      const newData = [...prev]
      const lastPoint = newData[newData.length - 1]
      
      if (newData.length === 0) {
        return [{
          timestamp,
          binanceAggPrice: field === 'binanceAggPrice' ? price : null,
          chainlinkPrice: field === 'chainlinkPrice' ? price : null,
          polymarketUpPrice: null,
          polymarketDownPrice: null,
          binanceAggChange: field === 'binanceAggPrice' ? percentChange : null,
          chainlinkChange: field === 'chainlinkPrice' ? percentChange : null,
          polymarketUpChange: null,
          polymarketDownChange: null,
          time: new Date(timestamp).toLocaleTimeString()
        }]
      }
      
      if (timestamp - lastPoint.timestamp > 1000) {
        newData.push({
          timestamp,
          binanceAggPrice: field === 'binanceAggPrice' ? price : lastPoint.binanceAggPrice,
          chainlinkPrice: field === 'chainlinkPrice' ? price : lastPoint.chainlinkPrice,
          polymarketUpPrice: lastPoint.polymarketUpPrice,
          polymarketDownPrice: lastPoint.polymarketDownPrice,
          binanceAggChange: field === 'binanceAggPrice' ? percentChange : lastPoint.binanceAggChange,
          chainlinkChange: field === 'chainlinkPrice' ? percentChange : lastPoint.chainlinkChange,
          polymarketUpChange: lastPoint.polymarketUpChange,
          polymarketDownChange: lastPoint.polymarketDownChange,
          time: new Date(timestamp).toLocaleTimeString()
        })
      } else {
        lastPoint[field] = price
        lastPoint[changeField] = percentChange
      }
      
      return newData.slice(-MAX_DATA_POINTS)
    })
  }

  const updateOrderbookData = (
    field: 'polymarketUpPrice' | 'polymarketDownPrice',
    price: number,
    timestamp: number,
    percentChange: number
  ) => {
    const changeField = field === 'polymarketUpPrice' ? 'polymarketUpChange' : 'polymarketDownChange'
    
    console.log(`[Client] 📈 Updating chart with ${field}: ${price}`)
    
    setPriceData(prev => {
      const newData = [...prev]
      const lastPoint = newData[newData.length - 1]
      
      if (newData.length === 0) {
        const point = {
          timestamp,
          binanceAggPrice: null,
          chainlinkPrice: null,
          polymarketUpPrice: field === 'polymarketUpPrice' ? price : null,
          polymarketDownPrice: field === 'polymarketDownPrice' ? price : null,
          binanceAggChange: null,
          chainlinkChange: null,
          polymarketUpChange: field === 'polymarketUpPrice' ? percentChange : null,
          polymarketDownChange: field === 'polymarketDownPrice' ? percentChange : null,
          time: new Date(timestamp).toLocaleTimeString()
        }
        console.log('[Client] 📊 Created first orderbook point:', point)
        return [point]
      }
      
      // Always update the last point with orderbook data
      lastPoint[field] = price
      lastPoint[changeField] = percentChange
      
      const result = newData.slice(-MAX_DATA_POINTS)
      console.log(`[Client] 📊 Updated chart. Total points: ${result.length}, Last point:`, result[result.length - 1])
      return result
    })
  }

  // Determine price leader and calculate movement divergence
  useEffect(() => {
    const changes = [
      { source: 'binance_agg' as const, time: lastBinanceAggChange },
      { source: 'chainlink' as const, time: lastChainlinkChange }
    ].filter(c => c.time !== null) as { source: 'binance_agg' | 'chainlink', time: number }[]
    
    if (changes.length > 1) {
      const sorted = changes.sort((a, b) => b.time - a.time)
      const timeDiff = sorted[0].time - sorted[1].time
      
      if (timeDiff < 100) {
        setPriceLeader('equal')
      } else {
        setPriceLeader(sorted[0].source)
      }
    }
    
    // Calculate movement divergence (correlation analysis)
    if (movementEvents.length >= 4) {
      const recent = movementEvents.slice(-20) // Last 20 movements
      
      // Get Binance Agg vs Chainlink movements
      const binanceAggMovements = recent.filter(e => e.source === 'binance_agg')
      const chainlinkMovements = recent.filter(e => e.source === 'chainlink')
      
      if (binanceAggMovements.length > 0 && chainlinkMovements.length > 0) {
        // Calculate average lead time
        const leadTimes: number[] = []
        
        binanceAggMovements.forEach(bMove => {
          // Find the next chainlink movement in the same direction
          const nextChainlink = chainlinkMovements.find(cMove => 
            cMove.timestamp > bMove.timestamp && 
            cMove.direction === bMove.direction &&
            cMove.timestamp - bMove.timestamp < 10000 // Within 10 seconds
          )
          
          if (nextChainlink) {
            leadTimes.push(nextChainlink.timestamp - bMove.timestamp)
          }
        })
        
        if (leadTimes.length > 0) {
          const avgLeadTime = leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
          
          setMovementDivergence({
            binanceVsChainlink: null,
            binanceAggVsChainlink: avgLeadTime,
            leader: avgLeadTime > 0 ? 'Binance Agg leads' : 'Chainlink leads'
          })
        }
      }
    }
    
    // Generate trading signal based on Binance Agg leading Polymarket
    if (lastBinanceAggMovement) {
      const timeSinceMove = Date.now() - lastBinanceAggMovement.timestamp
      const hasChainlinkResponded = chainlinkRespondedTo && chainlinkRespondedTo > lastBinanceAggMovement.timestamp
      
      // Signal is valid for 5 seconds or until Chainlink responds
      if (timeSinceMove < 5000 && !hasChainlinkResponded) {
        const absChange = Math.abs(lastBinanceAggMovement.percentChange)
        
        // Calculate signal strength (0-100)
        // 0.01% change = 10 strength, 0.1% = 50, 0.5% = 100
        const strength = Math.min(100, Math.round(absChange * 200))
        
        setTradingSignal({
          action: lastBinanceAggMovement.direction === 'up' ? 'LONG' : 'SHORT',
          strength,
          reason: `Binance ${lastBinanceAggMovement.direction === 'up' ? 'rose' : 'dropped'} ${absChange.toFixed(3)}% - Chainlink hasn't responded yet`,
          timestamp: lastBinanceAggMovement.timestamp,
          binanceChange: lastBinanceAggMovement.percentChange,
          expectedChainlinkMove: true
        })
      } else if (hasChainlinkResponded) {
        // Signal expired - Chainlink caught up
        setTradingSignal({
          action: 'NEUTRAL',
          strength: 0,
          reason: 'Markets aligned - no arbitrage opportunity',
          timestamp: Date.now(),
          binanceChange: 0,
          expectedChainlinkMove: false
        })
      } else if (timeSinceMove >= 5000) {
        // Signal expired - timeout
        setTradingSignal({
          action: 'NEUTRAL',
          strength: 0,
          reason: 'Signal expired - Chainlink may not follow',
          timestamp: Date.now(),
          binanceChange: 0,
          expectedChainlinkMove: false
        })
      }
    }
  }, [lastBinanceAggChange, lastChainlinkChange, movementEvents, lastBinanceAggMovement, chainlinkRespondedTo])

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
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <p className="mb-2 text-sm text-white">{payload[0].payload.time}</p>
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
    <div className="p-8 min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-bold text-center text-white">
          Bitcoin Price Latency Arbitrage
        </h1>
        <p className="mb-2 text-center text-gray-300">
          Real-time trading signals based on Binance leading Polymarket
        </p>
        <p className="mb-8 text-sm text-center text-gray-400">
          Server-side WebSocket connections for microsecond-level accuracy
        </p>

        {/* Trading Signal Alert */}
        {tradingSignal.action !== 'NEUTRAL' && (
          <div className={`mb-8 p-6 rounded-lg border-2 animate-pulse ${
            tradingSignal.action === 'LONG' 
              ? 'bg-green-900 bg-opacity-30 border-green-500' 
              : 'bg-red-900 bg-opacity-30 border-red-500'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-4 items-center">
                <span className={`text-5xl font-bold ${
                  tradingSignal.action === 'LONG' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {tradingSignal.action === 'LONG' ? '📈 LONG' : '📉 SHORT'}
                </span>
                <div>
                  <div className="flex gap-2 items-center">
                    <span className="text-2xl font-bold text-white">
                      Signal Strength: {tradingSignal.strength}%
                    </span>
                    <div className="overflow-hidden w-32 h-3 bg-gray-700 rounded-full">
                      <div 
                        className={`h-full transition-all ${
                          tradingSignal.action === 'LONG' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${tradingSignal.strength}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-300">{tradingSignal.reason}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Binance moved:</p>
                <p className={`text-2xl font-bold ${
                  tradingSignal.binanceChange > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {tradingSignal.binanceChange > 0 ? '+' : ''}{tradingSignal.binanceChange.toFixed(3)}%
                </p>
              </div>
            </div>
            <div className="flex gap-2 items-center text-sm text-yellow-300">
              <span>⚠️</span>
              <span>Polymarket hasn't reflected this move yet - potential arbitrage opportunity</span>
            </div>
          </div>
        )}

        {/* Status Indicators */}
        <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-4">
          <div className={`bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border ${
            priceLeader === 'binance_agg' ? 'border-blue-500 shadow-lg shadow-blue-500/50' : 'border-gray-700'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className="flex gap-2 items-center text-sm text-gray-400">
                Binance
                {priceLeader === 'binance_agg' && <span className="text-xs text-blue-400">⚡</span>}
              </span>
              <div className={`w-3 h-3 rounded-full ${getStatusColor(binanceAggStatus)}`}></div>
            </div>
            <p className="text-3xl font-bold text-white">
              ${currentBinanceAggPrice?.toFixed(2) || '---'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {lastBinanceAggUpdate ? `${Math.round((Date.now() - lastBinanceAggUpdate) / 1000)}s ago` : 'Connecting...'}
            </p>
            {serverLatency.binance_agg !== null && (
              <p className="mt-1 text-xs text-blue-400">
                Server→Client: {serverLatency.binance_agg}ms
              </p>
            )}
          </div>

          <div className={`bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border ${
            priceLeader === 'chainlink' ? 'border-green-500 shadow-lg shadow-green-500/50' : 'border-gray-700'
          }`}>
            <div className="flex justify-between items-center mb-2">
              <span className="flex gap-2 items-center text-sm text-gray-400">
                Chainlink
                {priceLeader === 'chainlink' && <span className="text-xs text-green-400">⚡</span>}
              </span>
              <div className={`w-3 h-3 rounded-full ${getStatusColor(chainlinkStatus)}`}></div>
            </div>
            <p className="text-3xl font-bold text-white">
              ${currentChainlinkPrice?.toFixed(2) || '---'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {lastChainlinkUpdate ? `${Math.round((Date.now() - lastChainlinkUpdate) / 1000)}s ago` : 'Connecting...'}
            </p>
            {serverLatency.chainlink !== null && (
              <p className="mt-1 text-xs text-green-400">
                Server→Client: {serverLatency.chainlink}ms
              </p>
            )}
          </div>

          <div className="p-6 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700 backdrop-blur-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Leader</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {priceLeader === 'binance_agg' && '🔵 Binance'}
              {priceLeader === 'chainlink' && '🟢 Chainlink'}
              {priceLeader === 'equal' && '⚪ Equal'}
              {!priceLeader && '⏳ Waiting...'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Price discovery leader
            </p>
          </div>
        </div>

        {/* Movement Correlation Chart */}
        <div className="p-6 mb-8 bg-gray-800 bg-opacity-50 rounded-lg border border-purple-700 backdrop-blur-lg">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Normalized Price Movements (% Change)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
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
                tickFormatter={(value) => `${value.toFixed(2)}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ color: '#fff' }}
                iconType="line"
              />
              <Line 
                type="monotone" 
                dataKey="binanceAggChange" 
                stroke="#3B82F6" 
                name="Binance Δ%"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line 
                type="monotone" 
                dataKey="chainlinkChange" 
                stroke="#10B981" 
                name="Chainlink Δ%"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-sm text-gray-400">
            📊 This shows normalized price movements showing which feed detects changes first.
          </p>
        </div>

        {/* Absolute Price Chart with Polymarket Probabilities */}
        <div className="p-6 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700 backdrop-blur-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">
              Absolute Prices + Polymarket Probabilities
            </h2>
            {marketOpenPrice && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Market Open Price</p>
                <p className="text-lg font-bold text-yellow-400">${marketOpenPrice.toFixed(2)}</p>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time" 
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
              />
              <YAxis 
                yAxisId="left"
                stroke="#9CA3AF"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                domain={['auto', 'auto']}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#A855F7"
                tick={{ fill: '#A855F7', fontSize: 12 }}
                domain={[0, 1]}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              />
              {marketOpenPrice && (
                <ReferenceLine 
                  yAxisId="left"
                  y={marketOpenPrice} 
                  stroke="#EAB308" 
                  strokeWidth={2} 
                  strokeDasharray="10 5"
                  label={{ value: `Open: $${marketOpenPrice.toFixed(0)}`, position: 'right', fill: '#EAB308', fontSize: 12 }}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ color: '#fff' }}
                iconType="line"
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="binanceAggPrice" 
                stroke="#3B82F6" 
                name="Binance"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="chainlinkPrice" 
                stroke="#10B981" 
                name="Chainlink"
                dot={false}
                strokeWidth={2}
                connectNulls
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="polymarketUpPrice" 
                stroke="#22C55E" 
                name="PM UP"
                dot={false}
                strokeWidth={2}
                connectNulls
                strokeDasharray="5 5"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="polymarketDownPrice" 
                stroke="#EF4444" 
                name="PM DOWN"
                dot={false}
                strokeWidth={2}
                connectNulls
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-sm text-gray-400">
            📊 Left axis: Spot/Oracle prices in USD. Right axis: Polymarket probabilities (0-1). 
            <span className="text-yellow-400">Yellow dashed line</span> = Market open price reference.
          </p>
        </div>

        {/* Trading Signal Analysis */}
        <div className="p-6 mt-8 bg-gray-800 bg-opacity-50 rounded-lg border border-purple-700 backdrop-blur-lg">
          <h3 className="mb-3 text-lg font-semibold text-white">📊 Signal Analysis</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-semibold text-white">How It Works</h4>
              <div className="space-y-2 text-sm text-gray-300">
                <p>📊 Tracks price movements on Binance in real-time</p>
                <p>⏱️ Detects when Polymarket hasn't responded yet (5 second window)</p>
                <p>📈 <span className="text-green-400">LONG signal</span> when Binance rises first</p>
                <p>📉 <span className="text-red-400">SHORT signal</span> when Binance drops first</p>
                <p>💪 Signal strength: 0.01% move = 10%, 0.5% move = 100%</p>
                <p>⚡ Signal expires when Chainlink catches up or after 5 seconds</p>
              </div>
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-white">Recent Movements</h4>
              <div className="overflow-y-auto space-y-1 max-h-32">
                {movementEvents.length > 0 ? movementEvents.slice(-10).reverse().map((event, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2 text-xs bg-gray-900 rounded">
                    <span className={
                      event.source === 'binance_agg' ? 'text-blue-400' : 'text-green-400'
                    }>
                      {event.source === 'binance_agg' ? '🔵 Binance' : '🟢 Chainlink'}
                    </span>
                    <span className={event.direction === 'up' ? 'text-green-400' : 'text-red-400'}>
                      {event.direction === 'up' ? '↑' : '↓'} {event.percentChange.toFixed(3)}%
                    </span>
                    <span className="text-gray-500">
                      {Math.round((Date.now() - event.timestamp) / 1000)}s ago
                    </span>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">Waiting for movements...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="p-6 mt-8 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700 backdrop-blur-lg">
          <h3 className="mb-3 text-lg font-semibold text-white">Architecture</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>✅ <span className="text-blue-400">Server-side WebSocket connections</span> for accurate latency measurements</p>
            <p>✅ <span className="text-cyan-400">Server-Sent Events (SSE)</span> streams data to client</p>
            <p>✅ <span className="text-green-400">Deploy near exchanges</span> for lowest possible latency</p>
            <p>✅ <span className="text-yellow-400">Real-time arbitrage signals</span> when Binance leads Polymarket</p>
          </div>
        </div>
      </div>
    </div>
  )
}
