/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Ship source maps with production client bundles so browser devtools
  // show original TSX when debugging errors.
  productionBrowserSourceMaps: true,
  // duckdb is a native addon; keep it as a runtime require rather than
  // letting webpack try (and fail) to bundle it and its node-pre-gyp deps.
  serverExternalPackages: ["duckdb"],
};

export default nextConfig;
