import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Claude routes read their prompts from these files at runtime, so ship them with the routes.
  outputFileTracingIncludes: {
    "/api/analyse-tgs": ["./prompts/**/*"],
    "/api/site-check": ["./prompts/**/*"],
  },
};

export default nextConfig;
