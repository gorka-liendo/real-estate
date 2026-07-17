import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // el design system se distribuye compilado, pero transpilamos por si acaso (CSS)
  transpilePackages: ["@rep/ui-tenant"],
};

export default nextConfig;
