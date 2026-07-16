import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

const { version } = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")) as { version: string };
let piVersion = "unknown";
try {
  const piPkgPath = join(__dirname, "node_modules/@earendil-works/pi-coding-agent/package.json");
  piVersion = (JSON.parse(readFileSync(piPkgPath, "utf8")) as { version: string }).version;
} catch { /* package not found, use default */ }

const nextConfig: NextConfig = {
  // Next 16 defaults dev (and build) to Turbopack. The build-only `webpack`
  // hook below would otherwise make `next dev` refuse to start ("custom webpack
  // config with Turbopack"). An empty turbopack config acknowledges the split:
  // `next dev` uses Turbopack (fast HMR), `next build --webpack` uses the hook.
  turbopack: {},
  serverExternalPackages: [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
  ],
  allowedDevOrigins: ['192.168.*.*'],
  async headers() {
    return [
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_PI_VERSION: piVersion,
  },
  // Drop Next's file-tracing (nft) webpack plugin. pi-web is served with
  // `next start`, which never reads the .nft.json trace output (that only
  // matters for output:'standalone'). On Windows, nft globs the entire user
  // home dir and crashes with EPERM on legacy junctions (Application Data,
  // Cookies, Local Settings, ...). Dropping the plugin makes the build portable
  // and is a no-op for how pi-web actually runs.
  webpack: (config) => {
    config.plugins = (config.plugins || []).filter(
      (p: { constructor?: { name?: string } }) => p?.constructor?.name !== "TraceEntryPointsPlugin"
    );
    return config;
  },
};

export default nextConfig;
