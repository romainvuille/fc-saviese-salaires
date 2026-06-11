import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // turbopack désactivé — bug "Next.js package not found" avec Next.js 16
  // Nécessaire pour @react-pdf/renderer (module Node.js uniquement)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        zlib: false,
      }
    }
    return config
  },
}

export default nextConfig
