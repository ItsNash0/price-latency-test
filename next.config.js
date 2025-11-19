/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	// WebSocket library needs to be external for server components
	webpack: (config, { isServer }) => {
		if (isServer) {
			config.externals.push("ws")
		}
		return config
	},
}

module.exports = nextConfig
