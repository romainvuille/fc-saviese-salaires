import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // Turbopack (Next.js 16 default) — config vide pour éviter l'erreur de build Vercel
  turbopack: {},
  // Webpack config pour @react-pdf/renderer (modules Node.js côté client)
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
