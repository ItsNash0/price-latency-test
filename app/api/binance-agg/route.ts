import { NextRequest } from "next/server"
import WebSocket from "ws"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
	const encoder = new TextEncoder()

	const stream = new ReadableStream({
		start(controller) {
			let ws: WebSocket | null = null

			const connect = () => {
				ws = new WebSocket(
					"wss://stream.binance.com:9443/ws/btcusdt@aggTrade"
				)

				ws.on("open", () => {
					console.log("[Server] Binance Agg WebSocket connected")
					try {
						const data = JSON.stringify({
							type: "status",
							status: "connected",
							source: "binance_agg",
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))
					} catch (error) {
						// Controller already closed, ignore
					}
				})

				ws.on("message", (data: WebSocket.Data) => {
					try {
						const parsed = JSON.parse(data.toString())
						const price = parseFloat(parsed.p)
						const serverTimestamp = Date.now()

						const message = JSON.stringify({
							type: "price",
							source: "binance_agg",
							price,
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
						}
					} catch (error) {
						console.error(
							"[Server] Binance Agg parse error:",
							error
						)
					}
				})

				ws.on("error", (error) => {
					console.error(
						"[Server] Binance Agg WebSocket error:",
						error
					)
					try {
						const data = JSON.stringify({
							type: "status",
							status: "error",
							source: "binance_agg",
						})
						controller.enqueue(encoder.encode(`data: ${data}\n\n`))
					} catch (enqueueError) {
						// Controller already closed, ignore
					}
				})

				ws.on("close", () => {
					console.log("[Server] Binance Agg WebSocket closed")
					try {
						const data = JSON.stringify({
							type: "status",
							status: "disconnected",
							source: "binance_agg",
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
					"[Server] Client disconnected from Binance Agg stream"
				)
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
