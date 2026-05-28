import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/rpc",
        destination: "https://rpc.xlayer.tech/",
      },
    ];
  },
};

export default nextConfig;
