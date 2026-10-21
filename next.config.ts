import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Ways to open the dev server from another device: same Wi-Fi, or a VS Code port-forwarding tunnel.
// Only trusted while running `next dev`, so the deployed app keeps the strict same-origin check.
const DEV_HOSTS = ["192.168.*.*", "10.*.*.*", "*.local", "**.devtunnels.ms"];

export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    cacheComponents: true,
    partialPrefetching: true,
    poweredByHeader: false,
    // Hide the "N" dev-tools button (it covered the profile menu). Errors still show while developing.
    devIndicators: false,
    // Let phones and tunnels load the dev server's own assets.
    allowedDevOrigins: DEV_HOSTS,
    experimental: {
      // Sign in / sign out / save profile are Server Actions; Next blocks them when the request's Origin
      // differs from the host. VS Code port forwarding rewrites Origin to localhost:<port> while sending
      // x-forwarded-host: xxxx-3000.inc1.devtunnels.ms, so localhost has to be listed too (dev only).
      serverActions: { allowedOrigins: isDev ? [...DEV_HOSTS, `localhost:${process.env.PORT || 3000}`] : [] },
    },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
