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

// Fetch the crypto price for the current window
async function fetchCryptoPrice(
	eventStartTime: string,
	endDate: string
): Promise<{ openPrice: number; closePrice: number } | null> {
	try {
		const url = `https://polymarket.com/api/crypto/crypto-price?symbol=BTC&eventStartTime=${eventStartTime}&variant=fifteen&endDate=${endDate}`
		console.log(`[Server] Fetching crypto price: ${url}`)

		const response = await fetch(url, { cache: "no-store" })

		if (!response.ok) {
			console.error(
				`[Server] Failed to fetch crypto price: ${response.status}`
			)
			return null
		}

		const data = await response.json()
		console.log(
			`[Server] Crypto price - Open: ${data.openPrice}, Close: ${data.closePrice}`
		)

		return {
			openPrice: data.openPrice,
			closePrice: data.closePrice,
		}
	} catch (error) {
		console.error("[Server] Error fetching crypto price:", error)
		return null
	}
}

// Fetch the current BTC Up/Down market
async function fetchCurrentMarket(): Promise<{
	assetIds: string[]
	upTokenId: string
	downTokenId: string
	openPrice: number
	closePrice: number
	eventStartTime: string
	endDate: string
} | null> {
	try {
		const timestamp = getCurrentWindowTimestamp()
		const slug = `btc-updown-15m-${timestamp}`

		console.log(`[Server] Fetching market: ${slug}`)

		const response = await fetch(
			`https://gamma-api.polymarket.com/markets?slug=${slug}`,
			{ cache: "no-store" }
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
		const outcomes = JSON.parse(market.outcomes) as string[]

		console.log(`[Server] Found market: ${market.question}`)
		console.log(`[Server] Outcomes: ${outcomes}`)
		console.log(`[Server] Token IDs: ${clobTokenIds}`)

		// Map token IDs to outcomes (first is UP, second is DOWN typically)
		const upIndex = outcomes.findIndex((o) => o.toLowerCase() === "up")
		const downIndex = outcomes.findIndex((o) => o.toLowerCase() === "down")

		// Fetch crypto price data
		const cryptoPrice = await fetchCryptoPrice(
			market.events[0].startTime,
			market.endDate
		)

		if (!cryptoPrice) {
			console.error("[Server] Failed to fetch crypto price")
			// Return without price data
			return {
				assetIds: clobTokenIds,
				upTokenId: clobTokenIds[upIndex],
				downTokenId: clobTokenIds[downIndex],
				openPrice: 0,
				closePrice: 0,
				eventStartTime: market.events[0].startTime,
				endDate: market.endDate,
			}
		}

		return {
			assetIds: clobTokenIds,
			upTokenId: clobTokenIds[upIndex],
			downTokenId: clobTokenIds[downIndex],
			openPrice: cryptoPrice.openPrice,
			closePrice: cryptoPrice.closePrice,
			eventStartTime: market.events[0].startTime,
			endDate: market.endDate,
		}
	} catch (error) {
		console.error("[Server] Error fetching market:", error)
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
			let tokenMapping: {
				upTokenId: string
				downTokenId: string
			} | null = null
			let lastSentTimestamp = 0
			const THROTTLE_MS = 100 // Only send updates every 500ms

			const connect = async () => {
				// Fetch current market token IDs
				const marketInfo = await fetchCurrentMarket()

				if (!marketInfo) {
					console.error(
						"[Server] Failed to get asset IDs, retrying in 5s..."
					)
					setTimeout(connect, 5000)
					return
				}

				tokenMapping = {
					upTokenId: marketInfo.upTokenId,
					downTokenId: marketInfo.downTokenId,
				}

				ws = new WebSocket("wss://ws-live-data.polymarket.com")

				ws.on("open", () => {
					console.log(
						"[Server] Polymarket Orderbook WebSocket connected"
					)
					reconnectAttempts = 0

					// Subscribe to price changes for the token IDs
					// Format according to: https://raw.githubusercontent.com/Polymarket/real-time-data-client/refs/heads/main/examples/quick-connection.ts
					const subscribeMessage = {
						action: "subscribe",
						subscriptions: [
							{
								topic: "clob_market",
								type: "*", // Get all types including price_change
								filters: JSON.stringify(marketInfo.assetIds), // Array of token IDs as JSON string
							},
						],
					}

					console.log(
						"[Server] Subscribing to clob_market with token IDs:",
						marketInfo.assetIds
					)
					console.log(`[Server] UP token: ${marketInfo.upTokenId}`)
					console.log(
						`[Server] DOWN token: ${marketInfo.downTokenId}`
					)
					ws?.send(JSON.stringify(subscribeMessage))

					try {
						const data = JSON.stringify({
							type: "status",
							status: "connected",
							source: "polymarket_orderbook",
							assetIds: marketInfo.assetIds,
							upTokenId: marketInfo.upTokenId,
							downTokenId: marketInfo.downTokenId,
							openPrice: marketInfo.openPrice,
							closePrice: marketInfo.closePrice,
							eventStartTime: marketInfo.eventStartTime,
							endDate: marketInfo.endDate,
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
						if (
							parsed.topic === "clob_market" &&
							parsed.type === "price_change"
						) {
							const payload = parsed.payload

							if (payload && payload.pc && tokenMapping) {
								const serverTimestamp = Date.now()

								// Throttle updates - only send every THROTTLE_MS
								if (
									serverTimestamp - lastSentTimestamp <
									THROTTLE_MS
								) {
									return
								}
								lastSentTimestamp = serverTimestamp

								// Collect UP and DOWN prices from this batch
								let upPrice: number | null = null
								let downPrice: number | null = null

								// Process each price change in the array - ONLY BUY orders
								payload.pc.forEach((priceChange: any) => {
									// Only process BUY orders (si field)
									if (priceChange.si !== "BUY") {
										return
									}

									// Determine if this is UP or DOWN token
									const isUpToken =
										priceChange.a ===
										tokenMapping?.upTokenId
									const isDownToken =
										priceChange.a ===
										tokenMapping?.downTokenId

									if (isUpToken) {
										upPrice = parseFloat(priceChange.p)
									} else if (isDownToken) {
										downPrice = parseFloat(priceChange.p)
									}
								})

								// Send update if we have either UP or DOWN price
								if (upPrice !== null || downPrice !== null) {
									const message = JSON.stringify({
										type: "price_change",
										source: "polymarket_orderbook",
										upPrice,
										downPrice,
										market: payload.m,
										timestamp: parseInt(payload.t),
										serverTimestamp,
									})

									try {
										controller.enqueue(
											encoder.encode(
												`data: ${message}\n\n`
											)
										)
									} catch (enqueueError) {
										// Controller closed, stop processing
										if (ws) ws.close()
										if (pingInterval)
											clearInterval(pingInterval)
									}
								}
							}
						}
					} catch (error) {
						// Only log non-JSON parsing errors
						if (error instanceof SyntaxError) {
							// Incomplete or malformed JSON, skip silently
							return
						}
						console.error(
							"[Server] Polymarket Orderbook error:",
							error
						)
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
					console.log(
						"[Server] Polymarket Orderbook WebSocket closed"
					)
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
