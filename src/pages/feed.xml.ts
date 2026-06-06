/**
 * feed.xml.ts — Static RSS 2.0 feed generator
 * Outputs /feed.xml at build time.
 * Contains all active + closing-soon opportunities, sorted by deadline.
 */

export const GET = async ({ site }: { site: URL | undefined }) => {
  // import.meta.glob works in API routes (Astro.glob does not)
  const oppModules = import.meta.glob('/content/opportunities/**/*.md', { eager: true }) as Record<string, any>;

  const siteUrl = site?.toString().replace(/\/$/, '') ?? 'https://example.com';

  const opportunities = Object.entries(oppModules)
    .map(([filepath, mod]) => {
      const parts = filepath.split('/');
      const slug = parts.pop()!.replace('.md', '');
      const category = parts.pop()!;
      return {
        slug,
        category,
        url: `${siteUrl}/opportunities/${category}/${slug}/`,
        ...(mod.frontmatter ?? {}),
      };
    })
    .filter(o => o.status !== 'archived')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  const escXml = (str: string) =>
    String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const items = opportunities.map(opp => {
    const pubDate = new Date(opp.publicationDate ?? opp.deadline).toUTCString();
    return `
    <item>
      <title>${escXml(opp.title)}</title>
      <link>${escXml(opp.url)}</link>
      <guid isPermaLink="true">${escXml(opp.url)}</guid>
      <description>${escXml(`${opp.summary ?? ''} | Deadline: ${opp.deadline} | Value: ${opp.amount ?? 'N/A'} | Region: ${opp.region ?? 'Global'}`)}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${escXml(opp.category)}</category>
    </item>`;
  }).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Opportunity Radar</title>
    <link>${siteUrl}</link>
    <description>Active AI grants, fellowships, startup programs, competitions, and courses — curated weekly.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
