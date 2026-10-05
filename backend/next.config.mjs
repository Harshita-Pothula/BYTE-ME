/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const headers = [...securityHeaders]

    // Send HSTS only in production, where the API is expected to sit behind
    // HTTPS. Do not include subdomains: their TLS posture is not controlled here.
    if (process.env.NODE_ENV === 'production' && process.env.BYTEME_HSTS_ENABLED === 'true') {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' })
    }

    return [{ source: '/:path*', headers }]
  },
  // Server-only code (Supabase service-role client, optimizer adapter) must never
  // be pulled into a browser bundle.
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
