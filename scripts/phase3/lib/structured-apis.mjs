// scripts/phase3/lib/structured-apis.mjs
//
// Tier 2: Structured free APIs that return real opportunity data without
// needing web scraping or LLM extraction of raw HTML.
//
// Each source here returns structured data (JSON or well-formed XML) that
// can be passed to the LLM as clean, pre-parsed content rather than a
// 160-char snippet. The LLM's job is then classification + field mapping,
// not reconstruction of facts from almost nothing.
//
// Sources:
//   - grants.gov     — US federal grants REST API, completely free, no key
//   - 80,000 Hours   — public job board JSON feed, AI-safety-adjacent
//   - Reddit          — free tier API, r/MachineLearning + regional subs
//   - Google CSE     — still used but now with site-specific queries targeting
//                       primary organization pages, not generic keyword search
//
// NOT included (paid or ToS violations):
//   - Twitter/X API  — free tier is 1 request/15min, unusable for batch
//   - LinkedIn API   — enterprise-only, no public feed
//
// These are intentionally separate from source-monitor.mjs.
// source-monitor watches *known* pages for changes.
// structured-apis discovers *new* entries from structured data feeds.
// Both feed into discover.mjs's LLM step with richer content.

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY;
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX;
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

// ─── grants.gov REST API ──────────────────────────────────────────────────────
// Completely free, no API key required. Returns active US federal grant
// opportunities. We filter by CFDA program areas relevant to AI/ML/CS.
// Documentation: https://www.grants.gov/api/

const GRANTS_GOV_CFDA = [
  "47.070", // NSF — Computer and Information Science and Engineering
  "47.041", // NSF — Engineering (AI applications)
  "47.076", // NSF — STEM Education
  "12.910", // DOD — Research and Technology Development
  "81.049", // DOE — Office of Science
];

export async function fetchGrantsGov() {
  const results = [];
  for (const cfda of GRANTS_GOV_CFDA) {
    try {
      // grants.gov v2 REST API — no key needed
      const url = new URL("https://api.grants.gov/v2/opportunities/search");
      const body = {
        rows: 10,
        sortBy: "openDate|desc",
        status: ["posted", "forecasted"],
        cfdaNumbers: [cfda],
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn(`[grants.gov] HTTP ${res.status} for CFDA ${cfda}`);
        continue;
      }
      const data = await res.json();
      const items = (data.data?.opportunityHits || []).slice(0, 5);
      for (const opp of items) {
        results.push({
          url: `https://www.grants.gov/search-results-detail/${opp.id}`,
          title: opp.opportunityTitle || "",
          snippet: [
            `Agency: ${opp.agencyName || ""}`,
            `Award: ${opp.awardCeiling ? `up to $${Number(opp.awardCeiling).toLocaleString()}` : "not specified"}`,
            `Close: ${opp.closeDate || "not specified"}`,
            `Description: ${(opp.synopsis || "").slice(0, 400)}`,
          ].join(" | "),
          source: "grants.gov",
          structured: true, // flag: this came from a real API, not a snippet
        });
      }
    } catch (err) {
      console.warn(`[grants.gov] Error for CFDA ${cfda}: ${err.message}`);
    }
  }
  console.log(`[structured-apis] grants.gov: ${results.length} entries`);
  return results;
}

// ─── 80,000 Hours job board ───────────────────────────────────────────────────
// Public JSON feed, no auth needed. Returns AI safety / high-impact jobs
// and programs. Relevant for Global and USA regions.

export async function fetch80kHours() {
  try {
    const res = await fetch("https://jobs.80000hours.org/wp-json/wp/v2/jobs?per_page=20&orderby=date&order=desc", {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "AI-Opportunity-Radar/1.0 (+https://mapd.cc)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    const results = (Array.isArray(items) ? items : []).slice(0, 10).map((item) => ({
      url: item.link || "",
      title: item.title?.rendered || "",
      snippet: (item.excerpt?.rendered || "").replace(/<[^>]+>/g, " ").slice(0, 400),
      source: "80000hours",
      structured: true,
    }));
    console.log(`[structured-apis] 80k Hours: ${results.length} entries`);
    return results;
  } catch (err) {
    console.warn(`[structured-apis] 80k Hours error: ${err.message}`);
    return [];
  }
}

// ─── Reddit API ───────────────────────────────────────────────────────────────
// Free tier. Needs REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (app credentials,
// free to create at reddit.com/prefs/apps). Returns recent posts from
// AI-relevant subreddits filtered by "fellowship", "grant", "internship",
// "apply now" etc. High-value: small/regional opportunities appear here
// before aggregators pick them up.
//
// If credentials aren't set, falls back to unauthenticated JSON endpoint
// (no OAuth, but rate-limited to ~30 requests/minute which is fine for once/week).

let _redditToken = null;

async function getRedditToken() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null;
  if (_redditToken) return _redditToken;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AI-Opportunity-Radar/1.0 (+https://mapd.cc)",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _redditToken = data.access_token;
    return _redditToken;
  } catch (err) {
    console.warn(`[reddit] Auth failed: ${err.message}`);
    return null;
  }
}

const REDDIT_SOURCES = {
  Global: [
    { sub: "MachineLearning", query: "fellowship OR grant OR internship OR \"apply now\" OR \"applications open\"" },
    { sub: "artificial", query: "fellowship OR grant OR internship opportunity" },
    { sub: "AIColab", query: "opportunity OR fellowship OR grant" },
    "site:gofractional.com/jobs fractional 2026",
    "site:fractionaljobs.io fractional head OR cto OR cmo",
    "site:arc.dev fractional OR part-time AI OR ML engineer 2026",
    "site:indeed.com fractional chief AI officer remote",
  ],
  India: [
    { sub: "india", query: "AI fellowship OR AI grant OR AI internship 2026" },
    { sub: "cscareerquestions", query: "India AI fellowship OR grant" },
    { sub: "Indian_Academia", query: "AI OR ML fellowship OR grant" },
    { sub: "developersIndia", query: "AI internship OR fellowship 2026" },
    "site:gofractional.com OR site:fractionaljobs.io india fractional",
  ],
  SEA: [
    { sub: "singapore", query: "AI fellowship OR AI grant OR AI internship 2026" },
    { sub: "malaysia", query: "AI opportunity OR fellowship 2026" },
    { sub: "Philippines", query: "AI fellowship OR grant 2026" },
    "site:gofractional.com OR site:fractionaljobs.io singapore OR asia fractional",
    "site:arc.dev fractional AI engineer Singapore OR SEA part-time",
  ],
  Europe: [
    { sub: "cscareerquestionsEU", query: "AI fellowship OR grant OR internship 2026" },
    { sub: "MachineLearning", query: "Europe fellowship OR EU grant AI" },
    "site:gofractional.com OR site:fractionaljobs.io europe OR london fractional",
    "site:arc.dev fractional AI advisor UK OR EU part-time",
  ],
  USA: [
    { sub: "cscareerquestions", query: "AI fellowship OR AI grant OR research internship 2026" },
    { sub: "MachineLearning", query: "fellowship OR residency OR \"applications open\"" },
    { sub: "gradadmissions", query: "AI fellowship OR NSF OR DOE grant" },
    "site:gofractional.com/jobs united states fractional",
    "site:arc.dev fractional applied AI engineer USA part-time",
    "site:indeed.com fractional CTO OR CAIO AI remote United States",
  ],
  Australia: [
    { sub: "australia", query: "AI fellowship OR AI grant OR CSIRO 2026" },
    { sub: "cscareerquestions", query: "Australia AI internship OR fellowship" },
    "site:gofractional.com OR site:fractionaljobs.io australia fractional",
  ],
};

export async function fetchReddit(region) {
  const sources = REDDIT_SOURCES[region] || [];
  const results = [];
  const token = await getRedditToken();

  for (const { sub, query } of sources) {
    try {
      // Use authenticated API if token available, else public JSON (works but slower rate limits)
      const baseUrl = token
        ? `https://oauth.reddit.com/r/${sub}/search.json`
        : `https://www.reddit.com/r/${sub}/search.json`;

      const url = new URL(baseUrl);
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "new");
      url.searchParams.set("limit", "10");
      url.searchParams.set("restrict_sr", "true");
      url.searchParams.set("t", "month"); // last month only

      const headers = {
        "User-Agent": "AI-Opportunity-Radar/1.0 (+https://mapd.cc)",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`[reddit] r/${sub}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const posts = data?.data?.children || [];
      for (const { data: post } of posts.slice(0, 5)) {
        // Skip posts that are clearly off-topic (pinned announcements, memes etc)
        if (post.score < 5) continue; // some upvotes = real community interest
        if (!post.url) continue;
        results.push({
          url: post.url !== post.permalink
            ? post.url                              // external link post
            : `https://reddit.com${post.permalink}`, // self post
          title: post.title || "",
          snippet: (post.selftext || "").slice(0, 400) || `r/${post.subreddit} — ${post.title}`,
          source: `reddit:r/${sub}`,
          structured: false, // self-reported, treat like a snippet
        });
      }
    } catch (err) {
      console.warn(`[reddit] r/${sub}: ${err.message}`);
    }
  }
  console.log(`[structured-apis] Reddit (${region}): ${results.length} entries`);
  return results;
}

// ─── Google CSE — site-specific targeting ────────────────────────────────────
// Replaces the old generic-keyword approach. Instead of "AI fellowship 2026 apply"
// (which returns aggregators), we target specific primary organization domains.
// "site:anthropic.com fellowship 2026" returns Anthropic's own pages only.
// This is still Google CSE (100 free queries/day) but now hits primary sources.

const SITE_SPECIFIC_QUERIES = {
  Global: [
    "site:alignment.anthropic.com 2026",
    "site:openai.com residency OR fellowship 2026",
    "site:openai.com/residency 2027",
    "site:governance.ai fellowship 2026",
    "site:openphilanthropy.org grant 2026",
    "site:research.facebook.com fellowship 2026",
    "site:cohere.com scholars program 2026",
    "site:apply.workable.com/huggingface internship 2026",
    "site:eleuther.ai soar 2026",
    "site:sakana.ai careers internship OR residency 2026",
  ],
  India: [
    "site:indiaai.gov.in grant OR fellowship 2026",
    "site:meity.gov.in AI scheme 2026",
    "site:startupindia.gov.in AI 2026",
    "site:stpi.in challenge OR grant 2026",
  ],
  SEA: [
    "site:aisingapore.org programme 2026",
    "site:imda.gov.sg AI grant 2026",
    "site:sea.ai internship OR fellowship 2026",
    "site:talent.alibaba.com Qwen OR DAMO internship 2026",
  ],
  Europe: [
    "site:turing.ac.uk fellowship OR grant 2026",
    "site:ellis.eu fellowship 2026",
    "site:claire-ai.org opportunity 2026",
    "site:jobs.lever.co/mistral internship 2026",
    "site:jobs.ashbyhq.com/perplexity internship 2026",
  ],
  USA: [
    "site:grants.gov AI OR machine learning 2026",
    "site:nsf.gov CISE AI fellowship 2026",
    "site:darpa.mil AI research 2026",
    "site:anthropic.com fellowship OR corps 2026",
    "site:metaresearchphdfellowship.smapply.io 2026",
    "site:openai.com residency 2027",
    "site:openai.com safety fellowship 2027",
    "site:databricks.com careers GenAI OR MosaicAI internship 2026",
    "site:anyscale.com careers internship OR fellowship 2026",
    "site:together.ai careers internship OR fellowship 2026",
  ],
  Australia: [
    "site:csiro.au funding AI 2026",
    "site:arc.gov.au AI grant 2026",
    "site:startupaus.org AI program 2026",
  ],
};

export async function fetchSiteSpecificCSE(region) {
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) {
    console.warn("[cse] GOOGLE_CSE_KEY/CX not set — skipping site-specific search");
    return [];
  }
  const queries = SITE_SPECIFIC_QUERIES[region] || [];
  const results = [];
  for (const query of queries) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", GOOGLE_CSE_KEY);
      url.searchParams.set("cx", GOOGLE_CSE_CX);
      url.searchParams.set("q", query);
      url.searchParams.set("num", "5");
      url.searchParams.set("dateRestrict", "m3"); // last 3 months only
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`[cse] HTTP ${res.status} for "${query}"`);
        continue;
      }
      const data = await res.json();
      for (const item of (data.items || [])) {
        results.push({
          url: item.link,
          title: item.title || "",
          snippet: item.snippet || "",
          source: `cse:${query}`,
          structured: false,
        });
      }
    } catch (err) {
      console.warn(`[cse] Error for "${query}": ${err.message}`);
    }
  }
  console.log(`[structured-apis] Site-specific CSE (${region}): ${results.length} entries`);
  return results;
}

// ─── Full page fetch ──────────────────────────────────────────────────────────
// When any of the above sources return a URL, we can optionally fetch its full
// content for the LLM rather than relying on a snippet. This is the single
// highest-ROI change from the old pipeline: the model gets real content.
// Called by discover.mjs for URLs flagged as high-signal (changed primary
// sources, grants.gov entries, high-upvote Reddit posts).

export async function fetchFullPageContent(url, maxTokens = 4000) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Opportunity-Radar/1.0; +https://mapd.cc)",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Rough token estimate: 1 token ≈ 4 chars. Cap at maxTokens.
      .slice(0, maxTokens * 4);
    return text;
  } catch (err) {
    console.warn(`[fetch-page] Failed to fetch ${url}: ${err.message}`);
    return null;
  }
}

// ─── Combined gather function ─────────────────────────────────────────────────
// Called by discover.mjs — returns all candidates from all Tier 2 sources,
// enriched with full page content where feasible (structured API entries
// that have real deadlines/descriptions don't need full fetch — Reddit/CSE
// entries do).

export async function gatherStructuredCandidates(region) {
  const [grantsGov, eightyK, redditPosts, csePosts] = await Promise.allSettled([
    region === "USA" ? fetchGrantsGov() : Promise.resolve([]),
    ["Global", "USA"].includes(region) ? fetch80kHours() : Promise.resolve([]),
    fetchReddit(region),
    fetchSiteSpecificCSE(region),
  ]);

  const allItems = [
    ...(grantsGov.status === "fulfilled" ? grantsGov.value : []),
    ...(eightyK.status === "fulfilled" ? eightyK.value : []),
    ...(redditPosts.status === "fulfilled" ? redditPosts.value : []),
    ...(csePosts.status === "fulfilled" ? csePosts.value : []),
  ];

  // De-dupe by URL
  const seen = new Set();
  const deduped = allItems.filter((i) => {
    if (!i.url || seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });

  // Enrich non-structured items (CSE snippets, Reddit) with full page content.
  // Cap at 8 full-page fetches per run to keep runtime reasonable.
  // Structured items (grants.gov) already have enough content in their snippet.
  let fetchCount = 0;
  const enriched = [];
  for (const item of deduped) {
    if (!item.structured && fetchCount < 8 && item.url.startsWith("https://")) {
      const content = await fetchFullPageContent(item.url);
      if (content) {
        item.fullContent = content;
        fetchCount++;
      }
    }
    enriched.push(item);
  }

  console.log(`[structured-apis] Total for ${region}: ${enriched.length} (${fetchCount} full-page fetched)`);
  return enriched;
}
