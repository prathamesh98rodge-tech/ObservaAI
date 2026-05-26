import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@observaai/shared-types", "@observaai/ui-components", "@observaai/analytics-sdk"],
};

export default nextConfig;
