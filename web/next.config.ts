import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required because @ximi4ka-shop/shared ships .ts source rather than compiled JS.
  transpilePackages: ["@ximi4ka-shop/shared"],
  // Pin workspace root so Next doesn't pick up unrelated lockfiles higher in the tree.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
