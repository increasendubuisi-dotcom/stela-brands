import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@stela/brand-schema", "@stela/entitlements"],
  poweredByHeader: false,
};

export default nextConfig;
