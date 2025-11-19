import { NextRequest } from "next/server"
import WebSocket from "ws"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		start(controller) {
			let ws: WebSocket | null = null
			let pingInterval: NodeJS.Timeout | null = null

			const connect = () => {
				ws = new WebSocket("wss://ws-live-data.polymarket.com")

				ws.on("open", () => {
					console.log("[Server] Polymarket WebSocket connected")

					// Subscribe to BTC/USD chainlink prices
					const subscribeMessage = {
						action: "subscribe",
						subscriptions: [
							{
								topic: "crypto_prices_chainlink",
								type: "*",
								filters: '{"symbol":"btc/usd"}',
							},
						],
					}

					ws?.send(JSON.stringify(subscribeMessage))

					try {
						const data = JSON.stringify({
							type: "status",
							status: "connected",
							source: "chainlink",
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

						// Handle price updates
						if (
							parsed.topic === "crypto_prices_chainlink" &&
							parsed.type === "update"
						) {
							const payload = parsed.payload

							if (
								payload &&
								payload.symbol === "btc/usd" &&
								payload.value
							) {
								const price =
									typeof payload.value === "number"
										? payload.value
										: parseFloat(payload.value)
								const serverTimestamp = Date.now()

								const message = JSON.stringify({
									type: "price",
									source: "chainlink",
									price,
									serverTimestamp,
									originalTimestamp: payload.timestamp,
									originalData: parsed,
								})

								try {
									controller.enqueue(
										encoder.encode(`data: ${message}\n\n`)
									)
								} catch (enqueueError) {
									// Controller closed, stop processing
									if (ws) ws.close()
									if (pingInterval)
										clearInterval(pingInterval)
								}
							}
						}
					} catch (error) {
						// Only log non-JSON parsing errors
						if (error instanceof SyntaxError) {
							// Incomplete or malformed JSON, skip silently
							return
						}
						console.error("[Server] Chainlink error:", error)
					}
				})

				ws.on("error", (error) => {
					console.error("[Server] Polymarket WebSocket error:", error)
					try {
						const data = JSON.stringify({
							type: "status",
							status: "error",
							source: "chainlink",
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))
					} catch (enqueueError) {
						// Controller already closed, ignore
					}
				})

				ws.on("close", () => {
					console.log("[Server] Polymarket WebSocket closed")
					if (pingInterval) {
						clearInterval(pingInterval)
						pingInterval = null
					}
					try {
						const data = JSON.stringify({
							type: "status",
							status: "disconnected",
							source: "chainlink",
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))
						// Only reconnect if client is still connected
						setTimeout(connect, 3000)
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
					"[Server] Client disconnected from Chainlink stream"
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
