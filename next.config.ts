import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The TGS route reads its prompt from this file at runtime, so ship it with the route.
  outputFileTracingIncludes: {
    "/api/analyse-tgs": ["./prompts/**/*"],
  },
};

export default nextConfig;
