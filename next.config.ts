import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  distDir: process.env.FOREST_BUILD_DIST_DIR ?? ".next",
};

export default nextConfig;
