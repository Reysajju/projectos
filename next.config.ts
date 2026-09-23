import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: false,
};

export default nextConfig;
