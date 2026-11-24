import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

// Dev only: Next blocks its dev files (JS, hot reload) for any origin but localhost, so opening
// the admin at this Mac's network address (http://172.20.10.3:3000) never loaded. Allow this
// Mac's own IPv4 addresses, read at start, since they change with the network.
const localAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a?.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: localAddresses,
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@kaspilo/tokens", "@kaspilo/shared"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
