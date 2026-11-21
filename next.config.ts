import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "64mb" },
  },
  async redirects() {
    return [
      { source: "/", destination: "/digital-twins/villas-ajyad", permanent: false },
      // old addresses (QR codes already printed, shared links): /c/... keeps working and lands on /digital-twins/...
      { source: "/c/:path*", destination: "/digital-twins/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
