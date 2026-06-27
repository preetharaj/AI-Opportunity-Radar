// scripts/phase3/lib/search-providers.mjs
//
// Free, low-volume ways to surface raw candidate URLs for one region before
// any LLM is involved, per PRD §7.1. This stage is intentionally dumb: it
// does NOT decide what's a good opportunity, it just gathers a small set of
// links + snippets for the model to read and structure.
//
// ASSUMPTION (flagging, not deciding): the PRD names "Google Custom Search
// API's 100 free daily queries" as one option. That requires a Google Cloud
// project + Custom Search Engine ID, which is a manual one-time setup this
// script cannot do for you. If GOOGLE_CSE_KEY / GOOGLE_CSE_CX are not set as
// repo secrets, this module skips that source entirely rather than failing
// the whole job — RSS-only discovery still produces a (smaller) candidate
// pool, see RSS_FEEDS below. You'll want to add your own feeds there; the
// three included are placeholders to make the pipeline runnable out of the
// box, not a vetted source list.

const GOOGLE_CSE_KEY = process.env.GOOGLE_CSE_KEY;
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX;

// Region -> search query terms. Edit freely; this is config, not logic.
const REGION_QUERIES = {
  Global: ["AI fellowship 2026 apply", "AI research grant deadline 2026"],
  India: ["AI accelerator India 2026", "AI grant India government scheme"],
  SEA: ["AI accelerator Southeast Asia 2026", "AI grant Singapore Indonesia Vietnam"],
  Europe: ["AI accelerator Europe 2026 apply", "EU AI grant call 2026"],
  USA: ["AI fellowship USA 2026", "AI startup grant program US 2026"],
  Australia: ["AI accelerator Australia 2026", "AI grant Australia government"],
};

// Region -> RSS/Atom feeds known to surface this kind of content. Placeholder
// set — swap in feeds you trust. Kept small and explicit on purpose: an
// agent silently expanding its own source list is exactly the kind of
// unreviewed scope creep the PRD's human-review gate exists to prevent.
const RSS_FEEDS = {
  Global: ["https://www.aitracker.io/feed", "https://www.work-in-ai.com/rss.xml"],
  India: ["https://indiaai.gov.in/feed"],
  SEA: [],
  Europe: ["https://digital-strategy.ec.europa.eu/en/rss.xml"],
  USA: [],
  Australia: [],
};

/**
 * Gathers raw candidate URLs + short snippets for one region, from whichever
 * free sources are configured. Never throws — a source that fails or isn't
 * configured is just dropped, logged, and the rest continue.
 *
 * @param {string} region one of REGIONS from schema.mjs
 * @returns {Promise<{ items: {url: string, title: string, snippet: string, queryUsed: string}[], queriesUsed: string[] }>}
 */
export async function gatherRawCandidates(region) {
  const items = [];
  const queriesUsed = [];

  if (GOOGLE_CSE_KEY && GOOGLE_CSE_CX) {
    for (const query of REGION_QUERIES[region] || []) {
      queriesUsed.push(query);
      try {
        const found = await googleCustomSearch(query);
        items.push(...found.map((f) => ({ ...f, queryUsed: query })));
      } catch (err) {
        console.warn(`[search] Google CSE query failed ("${query}"): ${err.message}`);
      }
    }
  } else {
    console.warn("[search] GOOGLE_CSE_KEY/GOOGLE_CSE_CX not set — skipping Custom Search, using RSS only");
  }

  for (const feedUrl of RSS_FEEDS[region] || []) {
    try {
      const found = await fetchRssFeed(feedUrl);
      items.push(...found.map((f) => ({ ...f, queryUsed: `rss:${feedUrl}` })));
    } catch (err) {
      console.warn(`[search] RSS feed failed (${feedUrl}): ${err.message}`);
    }
  }

  // De-dupe by URL — same link can surface from both search and RSS.
  const seen = new Set();
  const deduped = items.filter((i) => {
    if (seen.has(i.url)) return false;
    seen.add(i.url);
    return true;
  });

  return { items: deduped, queriesUsed };
}

async function googleCustomSearch(query) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", GOOGLE_CSE_KEY);
  url.searchParams.set("cx", GOOGLE_CSE_CX);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "10");

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((item) => ({
    url: item.link,
    title: item.title || "",
    snippet: item.snippet || "",
  }));
}

async function fetchRssFeed(feedUrl) {
  const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  // Minimal regex-based <item>/<entry> extraction — avoids adding an XML
  // parser dependency for a "best-effort raw link gathering" step that's
  // immediately followed by LLM structuring + zod validation downstream.
  // Not a general-purpose RSS parser; good enough for surfacing candidate
  // links, nothing here is trusted as final data.
  const items = [];
  const itemBlocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) || [];

  for (const block of itemBlocks.slice(0, 15)) {
    const link =
      block.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] ||
      block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1];
    const title = extractTextField(block, "title");
    const description = extractTextField(block, "description");
    if (link) {
      items.push({
        url: link.trim(),
        title: title.trim(),
        snippet: description.trim().slice(0, 300),
      });
    }
  }
  return items;
}

/**
 * Extracts a tag's text content, handling the two shapes real-world feeds
 * actually use: plain text (`<title>foo</title>`) and CDATA-wrapped
 * (`<title><![CDATA[foo &amp; bar]]></title>`). A plain `[^<]+` capture —
 * the original approach — silently returns an empty match on the CDATA
 * case, since `<` appears as part of `<![CDATA[` itself; confirmed by
 * testing against a realistic feed sample during implementation review.
 * CDATA-wrapped titles/descriptions are extremely common (many feed
 * generators default to it specifically so titles can contain & or <
 * without escaping), so this wasn't an edge case — it was silently
 * dropping a meaningful fraction of real items down to blank text with
 * no error anywhere.
 */
function extractTextField(block, tag) {
  const cdataMatch = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i"));
  if (cdataMatch) return decodeXmlEntities(cdataMatch[1]);
  const plainMatch = block.match(new RegExp(`<${tag}[^>]*>([^<]+)<\\/${tag}>`, "i"));
  if (plainMatch) return decodeXmlEntities(plainMatch[1]);
  return "";
}

/**
 * Decodes the small set of named entities that actually appear in feed
 * text (&amp; &lt; &gt; &quot; &apos;) plus numeric entities. Not a full
 * HTML entity table — feed titles/descriptions don't need one, and this
 * text is read by an LLM and then re-validated by zod downstream, not
 * rendered as HTML, so under-decoding a rare entity just means slightly
 * messier prompt input, not a correctness or safety issue.
 */
function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export { REGION_QUERIES, RSS_FEEDS };
