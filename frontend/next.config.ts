import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack workspace root configuration
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Proxy /api/v1/* to the backend in development to avoid CORS
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/api/v1/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "4000",
      },
    ],
  },
  // Strict mode for catching hydration issues early
  reactStrictMode: true,
};

export default nextConfig;
