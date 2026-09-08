/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Ship source maps with production client bundles so browser devtools
  // show original TSX when debugging errors.
  productionBrowserSourceMaps: true,
  // Native addon: runtime require, not bundled by webpack.
  serverExternalPackages: ["@duckdb/node-api"],
};

export default nextConfig;
