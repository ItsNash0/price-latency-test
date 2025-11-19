/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	// Ensure standalone output for better Docker/Nixpacks compatibility
	output: "standalone",
	// Allow WebSocket connections in production
	experimental: {
		serverActions: {
			allowedOrigins: ["*"],
		},
	},
}

module.exports = nextConfig
