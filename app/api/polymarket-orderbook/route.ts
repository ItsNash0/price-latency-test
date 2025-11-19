import { NextRequest } from "next/server"
import WebSocket from "ws"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Calculate the current 15-minute window start time
function getCurrentWindowTimestamp(): number {
	const now = new Date()
	const minutes = now.getUTCMinutes()
	const windowStart = Math.floor(minutes / 15) * 15
	
	now.setUTCMinutes(windowStart, 0, 0)
	return Math.floor(now.getTime() / 1000)
}

// Fetch the current BTC Up/Down market
async function fetchCurrentMarket(): Promise<string[] | null> {
	try {
		const timestamp = getCurrentWindowTimestamp()
		const slug = `btc-updown-15m-${timestamp}`
		
		console.log(`[Server] Fetching market: ${slug}`)
		
		const response = await fetch(
			`https://gamma-api.polymarket.com/markets?slug=${slug}`,
			{ cache: 'no-store' }
		)
		
		if (!response.ok) {
			console.error(`[Server] Failed to fetch market: ${response.status}`)
			return null
		}
		
		const data = await response.json()
		
		if (!data || data.length === 0) {
			console.error(`[Server] No market found for slug: ${slug}`)
			return null
		}
		
		const market = data[0]
		const clobTokenIds = JSON.parse(market.clobTokenIds) as string[]
		
		console.log(`[Server] Found market: ${market.question}`)
		console.log(`[Server] Token IDs: ${clobTokenIds}`)
		
		return clobTokenIds
	} catch (error) {
		console.error('[Server] Error fetching market:', error)
		return null
	}
}

export async function GET(request: NextRequest) {
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		start(controller) {
			let ws: WebSocket | null = null
			let pingInterval: NodeJS.Timeout | null = null
			let reconnectAttempts = 0
			const MAX_RECONNECT_DELAY = 30000 // 30 seconds max

			const connect = async () => {
				// Fetch current market token IDs
				const assetIds = await fetchCurrentMarket()
				
				if (!assetIds) {
					console.error('[Server] Failed to get asset IDs, retrying in 5s...')
					setTimeout(connect, 5000)
					return
				}

				ws = new WebSocket("wss://ws-subscriptions-clob.polymarket.com")

				ws.on("open", () => {
					console.log("[Server] Polymarket Orderbook WebSocket connected")
					reconnectAttempts = 0

					// Subscribe to price changes for the token IDs
					const subscribeMessage = {
						auth: {},
						type: "subscribe",
						channel: "market",
						markets: assetIds,
					}

					console.log('[Server] Subscribing to orderbook with token IDs:', assetIds)
					ws?.send(JSON.stringify(subscribeMessage))

					try {
						const data = JSON.stringify({
							type: "status",
							status: "connected",
							source: "polymarket_orderbook",
							assetIds,
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))
					} catch (error) {
						// Controller already closed, ignore
					}

					// Start PING interval
					pingInterval = setInterval(() => {
						if (ws?.readyState === WebSocket.OPEN) {
							ws.send(JSON.stringify({ type: "ping" }))
						}
					}, 5000)
				})

				ws.on("message", (data: WebSocket.Data) => {
					try {
						// Convert to string and validate it's not empty
						const dataString = data.toString().trim()
						if (!dataString) {
							return // Skip empty messages
						}

						const parsed = JSON.parse(dataString)

						// Handle PONG
						if (parsed.type === "pong") {
							return
						}

						// Handle price change messages
						if (parsed.asset_id && parsed.price !== undefined) {
							const serverTimestamp = Date.now()

							const message = JSON.stringify({
								type: "price_change",
								source: "polymarket_orderbook",
								assetId: parsed.asset_id,
								price: parseFloat(parsed.price),
								side: parsed.side,
								hash: parsed.hash,
								serverTimestamp,
								originalData: parsed,
							})

							try {
								controller.enqueue(
									encoder.encode(`data: ${message}\n\n`)
								)
							} catch (enqueueError) {
								// Controller closed, stop processing
								if (ws) ws.close()
								if (pingInterval) clearInterval(pingInterval)
							}
						}
					} catch (error) {
						// Only log non-JSON parsing errors
						if (error instanceof SyntaxError) {
							// Incomplete or malformed JSON, skip silently
							return
						}
						console.error("[Server] Polymarket Orderbook error:", error)
					}
				})

				ws.on("error", (error) => {
					console.error(
						"[Server] Polymarket Orderbook WebSocket error:",
						error
					)
					try {
						const data = JSON.stringify({
							type: "status",
							status: "error",
							source: "polymarket_orderbook",
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))
					} catch (enqueueError) {
						// Controller already closed, ignore
					}
				})

				ws.on("close", () => {
					console.log("[Server] Polymarket Orderbook WebSocket closed")
					if (pingInterval) {
						clearInterval(pingInterval)
						pingInterval = null
					}
					try {
						const data = JSON.stringify({
							type: "status",
							status: "disconnected",
							source: "polymarket_orderbook",
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))

						// Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
						reconnectAttempts++
						const delay = Math.min(
							1000 * Math.pow(2, reconnectAttempts - 1),
							MAX_RECONNECT_DELAY
						)
						console.log(
							`[Server] Reconnecting Polymarket Orderbook in ${delay}ms (attempt ${reconnectAttempts})`
						)
						setTimeout(connect, delay)
					} catch (enqueueError) {
						// Controller closed (client disconnected), don't reconnect
						console.log(
							"[Server] Client disconnected, not reconnecting"
						)
					}
				})
			}

			connect()

			// Cleanup on client disconnect
			request.signal.addEventListener("abort", () => {
				console.log(
					"[Server] Client disconnected from Polymarket Orderbook stream"
				)
				if (pingInterval) {
					clearInterval(pingInterval)
				}
				if (ws) {
					ws.close()
				}
			})
		},
	})

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	})
}

