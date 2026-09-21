/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Ship source maps with production client bundles so browser devtools
  // show original TSX when debugging errors.
  productionBrowserSourceMaps: true,
  // Not bundled by webpack: the DuckDB native addon, and `pg`, which reads `fs`
  // lazily for TLS material and so cannot be traced into a bundle.
  serverExternalPackages: ["@duckdb/node-api", "pg"],
};

export default nextConfig;
