'use client'

import { useEffect, useState } from 'react'
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
  const [lastBinanceUpdate, setLastBinanceUpdate] = useState<number | null>(null)
  const [lastBinanceAggUpdate, setLastBinanceAggUpdate] = useState<number | null>(null)
  const [lastChainlinkUpdate, setLastChainlinkUpdate] = useState<number | null>(null)
  const [priceLeader, setPriceLeader] = useState<'binance' | 'binance_agg' | 'chainlink' | 'equal' | null>(null)
  const [lastBinanceChange, setLastBinanceChange] = useState<number | null>(null)
  const [lastBinanceAggChange, setLastBinanceAggChange] = useState<number | null>(null)
  const [lastChainlinkChange, setLastChainlinkChange] = useState<number | null>(null)
  const [serverLatency, setServerLatency] = useState<{ binance: number | null, binance_agg: number | null, chainlink: number | null }>({
    binance: null,
    binance_agg: null,
    chainlink: null
  })

  useEffect(() => {
    // Connect to Binance Trade SSE
    const binanceEventSource = new EventSource('/api/binance-trade')
    
    binanceEventSource.onopen = () => {
      console.log('[Client] Connected to Binance Trade stream')
    }

    binanceEventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.type === 'status') {
          setBinanceStatus(message.status)
        } else if (message.type === 'price') {
          const clientTimestamp = Date.now()
          const latency = clientTimestamp - message.serverTimestamp
          
          setServerLatency(prev => ({ ...prev, binance: latency }))
          setLastBinanceUpdate(clientTimestamp)
          
          setCurrentBinancePrice(prevPrice => {
            if (prevPrice && Math.abs((message.price - prevPrice) / prevPrice) > 0.0001) {
              setLastBinanceChange(clientTimestamp)
            }
            return message.price
          })
          
          updatePriceData('binancePrice', message.price, clientTimestamp)
        }
      } catch (error) {
        console.error('[Client] Binance Trade parse error:', error)
      }
    }

    binanceEventSource.onerror = () => {
      console.error('[Client] Binance Trade stream error')
      setBinanceStatus('disconnected')
    }

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
            if (prevPrice && Math.abs((message.price - prevPrice) / prevPrice) > 0.0001) {
              setLastBinanceAggChange(clientTimestamp)
            }
            return message.price
          })
          
          updatePriceData('binanceAggPrice', message.price, clientTimestamp)
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
            if (prevPrice && Math.abs((message.price - prevPrice) / prevPrice) > 0.0001) {
              setLastChainlinkChange(clientTimestamp)
            }
            return message.price
          })
          
          updatePriceData('chainlinkPrice', message.price, clientTimestamp)
        }
      } catch (error) {
        console.error('[Client] Chainlink parse error:', error)
      }
    }

    chainlinkEventSource.onerror = () => {
      console.error('[Client] Chainlink stream error')
      setChainlinkStatus('disconnected')
    }

    // Cleanup
    return () => {
      binanceEventSource.close()
      binanceAggEventSource.close()
      chainlinkEventSource.close()
    }
  }, [])

  const updatePriceData = (field: 'binancePrice' | 'binanceAggPrice' | 'chainlinkPrice', price: number, timestamp: number) => {
    setPriceData(prev => {
      const newData = [...prev]
      const lastPoint = newData[newData.length - 1]
      
      if (newData.length === 0) {
        return [{
          timestamp,
          binancePrice: field === 'binancePrice' ? price : null,
          binanceAggPrice: field === 'binanceAggPrice' ? price : null,
          chainlinkPrice: field === 'chainlinkPrice' ? price : null,
          time: new Date(timestamp).toLocaleTimeString()
        }]
      }
      
      if (timestamp - lastPoint.timestamp > 1000) {
        newData.push({
          timestamp,
          binancePrice: field === 'binancePrice' ? price : lastPoint.binancePrice,
          binanceAggPrice: field === 'binanceAggPrice' ? price : lastPoint.binanceAggPrice,
          chainlinkPrice: field === 'chainlinkPrice' ? price : lastPoint.chainlinkPrice,
          time: new Date(timestamp).toLocaleTimeString()
        })
      } else {
        lastPoint[field] = price
      }
      
      return newData.slice(-MAX_DATA_POINTS)
    })
  }

  // Determine price leader
  useEffect(() => {
    const changes = [
      { source: 'binance' as const, time: lastBinanceChange },
      { source: 'binance_agg' as const, time: lastBinanceAggChange },
      { source: 'chainlink' as const, time: lastChainlinkChange }
    ].filter(c => c.time !== null) as { source: 'binance' | 'binance_agg' | 'chainlink', time: number }[]
    
    if (changes.length > 1) {
      const sorted = changes.sort((a, b) => b.time - a.time)
      const timeDiff = sorted[0].time - sorted[1].time
      
      if (timeDiff < 100) {
        setPriceLeader('equal')
      } else {
        setPriceLeader(sorted[0].source)
      }
    }
  }, [lastBinanceChange, lastBinanceAggChange, lastChainlinkChange])

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
        <p className="text-gray-300 text-center mb-2">
          Server-side WebSocket connections for accurate latency measurements
        </p>
        <p className="text-gray-400 text-center mb-8 text-sm">
          Deploy close to exchanges for lowest latency
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
            {serverLatency.binance !== null && (
              <p className="text-green-400 text-xs mt-1">
                Server→Client: {serverLatency.binance}ms
              </p>
            )}
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
            {serverLatency.binance_agg !== null && (
              <p className="text-cyan-400 text-xs mt-1">
                Server→Client: {serverLatency.binance_agg}ms
              </p>
            )}
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
            {serverLatency.chainlink !== null && (
              <p className="text-green-400 text-xs mt-1">
                Server→Client: {serverLatency.chainlink}ms
              </p>
            )}
          </div>

          <div className="bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm">Leader</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {priceLeader === 'binance' && '🔵 Binance'}
              {priceLeader === 'binance_agg' && '🔷 Binance Agg'}
              {priceLeader === 'chainlink' && '🟢 Chainlink'}
              {priceLeader === 'equal' && '⚪ Equal'}
              {!priceLeader && '⏳ Waiting...'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Price discovery leader
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

        {/* Info Section */}
        <div className="mt-8 bg-gray-800 bg-opacity-50 backdrop-blur-lg rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Architecture</h3>
          <div className="text-sm text-gray-300 space-y-2">
            <p>✅ <span className="text-blue-400">Server-side WebSocket connections</span> for accurate latency measurements</p>
            <p>✅ <span className="text-cyan-400">Server-Sent Events (SSE)</span> streams data to client</p>
            <p>✅ <span className="text-green-400">Deploy near exchanges</span> for lowest possible latency</p>
            <p>✅ <span className="text-yellow-400">Real-time leader detection</span> shows which source is fastest</p>
          </div>
        </div>
      </div>
    </div>
  )
}
