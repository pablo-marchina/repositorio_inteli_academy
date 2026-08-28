import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep the native ffmpeg binary as a traced server dependency instead of bundling it into the route JS.
  serverExternalPackages: ["ffmpeg-static"]
};

export default nextConfig;
