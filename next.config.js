/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // duckdb is a native addon; keep it as a runtime require rather than
  // letting webpack try (and fail) to bundle it and its node-pre-gyp deps.
  serverExternalPackages: ["duckdb"],
};

export default nextConfig;
