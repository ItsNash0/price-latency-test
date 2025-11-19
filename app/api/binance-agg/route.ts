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
					const data = JSON.stringify({
						type: "status",
						status: "connected",
						source: "binance_agg",
					})
					controller.enqueue(encoder.encode(`data: ${data}\n\n`))
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

						controller.enqueue(
							encoder.encode(`data: ${message}\n\n`)
						)
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
					const data = JSON.stringify({
						type: "status",
						status: "error",
						source: "binance_agg",
					})
					controller.enqueue(encoder.encode(`data: ${data}\n\n`))
				})

				ws.on("close", () => {
					console.log(
						"[Server] Binance Agg WebSocket closed, reconnecting..."
					)
					const data = JSON.stringify({
						type: "status",
						status: "disconnected",
						source: "binance_agg",
					})
					controller.enqueue(encoder.encode(`data: ${data}\n\n`))
					setTimeout(connect, 3000)
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
