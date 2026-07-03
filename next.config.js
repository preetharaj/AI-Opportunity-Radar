/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client"],
  },
  // Static export not used — Next.js App Router with serverless functions
  // Hosted on Vercel free tier (hobby plan)

  // ── SEO: permanent 301 redirect from legacy /opportunity/[id] URL ──────────
  // The canonical URL is now /opportunities/[id] (plural).
  // Google transfers link equity on 301 redirects, so any indexed /opportunity/
  // pages will eventually point to the new canonical URL.
  async redirects() {
    return [
      {
        source: "/opportunity/:id",
        destination: "/opportunities/:id",
        permanent: true, // 301 — tells Google to transfer ranking signals
      },
    ];
  },
};

module.exports = nextConfig;
