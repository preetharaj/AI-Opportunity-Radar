/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client"],
  },
  // Static export not used — Next.js App Router with serverless functions
  // Hosted on Vercel free tier (hobby plan)
};

module.exports = nextConfig;
