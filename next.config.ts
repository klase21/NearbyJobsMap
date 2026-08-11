import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["src/db/migrations/*.sql"],
  },
};

export default nextConfig;
