// scripts/phase3/lib/source-monitor.mjs
//
// Tier 1: Primary source monitoring.
//
// The old search approach (Google CSE + RSS) returns aggregator pages —
// Opportunity Desk, ProFellow, ScholarshipsandGrants — which are your
// competitors, not your sources. You end up scraping their output and
// re-proposing the same entries they already curate.
//
// This module checks a curated list of *primary* organization pages —
// lab career pages, government grant portals, program announcement blogs —
// directly. When a page's content changes since last week, it returns the
// full text of that page as input to the LLM. Full text is the key
// difference: the model gets 3,000–5,000 tokens of real content instead of
// a 160-char snippet, which is the difference between reliable extraction
// and guaranteed hallucination.
//
// "Monitoring" here is simple and deterministic:
//   1. Fetch the page
//   2. Hash its text content
//   3. Compare to the stored hash from last run (stored in a file per region)
//   4. If hash changed → return full text as a candidate for LLM processing
//   5. If hash unchanged → skip (nothing new to extract)
//
// This is cheap (one HTTP request per source per week), needs no API key,
// and catches announcements the same day they go live rather than after
// aggregators pick them up days later.
//
// ADDING SOURCES: Add URLs to PRIMARY_SOURCES below. You should personally
// verify each one: visit the URL, confirm it's a primary announcement page
// (not an aggregator), and check it updates when a new cohort opens. A URL
// that never changes produces zero signal and just wastes a fetch. A bad
// URL that 404s is logged and skipped, never a crash.
//
// HASH STORAGE: hashes are stored as JSON files in scripts/phase3/data/
// (one file per region, e.g. data/hashes-India.json). These must be
// committed to the repo after each run so the next run can compare.
// The discovery.yml workflow handles this commit automatically.

import { readFile, writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

// ─── Primary source registry ──────────────────────────────────────────────────
// These are official program/announcement pages, not aggregators.
// Each entry has:
//   url     — the page to monitor
//   label   — human-readable name for logs and PR body
//   note    — what to look for (helps reviewer quickly verify)
//
// Curated manually — do not auto-expand from agent output. That's exactly
// the kind of unreviewed scope creep the human-review gate exists to prevent.

export const PRIMARY_SOURCES = {
  Global: [
    {
      url: "https://alignment.anthropic.com/",
      label: "Anthropic Alignment Science blog",
      note: "Fellows Program announcements appear here first",
    },
    {
      url: "https://openai.com/residency/",
      label: "OpenAI Residency",
      note: "6-month paid residency — reopens annually, check for 2027 cycle opening",
    },
    {
      url: "https://openai.com/careers/emerging-talent/",
      label: "OpenAI Emerging Talent",
      note: "Internships and entry-level roles at OpenAI — rolling",
    },
    {
      url: "https://openai.com/index/introducing-openai-safety-fellowship/",
      label: "OpenAI Safety Fellowship",
      note: "External research fellowship — watch for next cohort announcement",
    },
    {
      url: "https://deepmind.google/careers/",
      label: "Google DeepMind Careers",
      note: "Research internships and scholar programs — changes when new cohorts open",
    },
    {
      url: "https://research.facebook.com/fellowship/",
      label: "Meta Research PhD Fellowship",
      note: "Applications open Aug 3, deadline Sep 20 annually — monitor for next cycle",
    },
    {
      url: "https://cohere.com/research/scholars-program",
      label: "Cohere Labs Scholars Program",
      note: "8-month paid research apprenticeship — applications open each August",
    },
    {
      url: "https://cohere.com/research",
      label: "Cohere Labs Research",
      note: "Catalyst Grants and broader research program announcements",
    },
    {
      url: "https://huggingface.co/join-us",
      label: "Hugging Face — Join Us",
      note: "Check for new intern/ML engineer openings — Workable board posting previously closed",
    },
    {
      url: "https://www.eleuther.ai/soar",
      label: "EleutherAI SOAR",
      note: "Summer of Open AI Research — 5-week online program, opens annually ~May",
    },
    {
      url: "https://crfm.stanford.edu",
      label: "Stanford CRFM",
      note: "Center for Research on Foundation Models — postdocs and fellowships follow university cycles",
    },
    {
      url: "https://www.governance.ai/opportunities",
      label: "GovAI Opportunities",
      note: "Fellowship and research scholar postings",
    },
    {
      url: "https://jobs.80000hours.org/?query=fellowship",
      label: "80,000 Hours — fellowships",
      note: "AI-safety-adjacent fellowship listings",
    },
    {
      url: "https://www.openphilanthropy.org/grants/",
      label: "Open Philanthropy Grants",
      note: "Career development and AI safety grants",
    },
    {
      url: "https://aiinsocietyhub.com/opportunities",
      label: "AI in Society Hub opportunities",
      note: "AI governance fellowships and grants",
    },
    {
      url: "https://sakana.ai/careers/",
      label: "Sakana AI Careers",
      note: "Tokyo-based AI lab — research residencies and engineering roles, English welcome",
    },
    {
      url: "https://worldlabs.ai/careers",
      label: "World Labs Careers",
      note: "Spatial intelligence AI lab — watch for fellowship or internship announcements",
    },
    {
      url: "https://together.ai/careers",
      label: "Together AI Careers",
      note: "Open AI infra lab — watch for research fellowships or internship programs",
    },
    {
      url: "https://www.databricks.com/company/careers",
      label: "Databricks / MosaicML Careers",
      note: "Search GenAI Engineering / Mosaic AI teams for research internships",
    },
    {
      url: "https://www.anyscale.com/careers",
      label: "Anyscale Careers",
      note: "Ray ecosystem lab — watch for internship or fellowship announcements",
    },
    {
      url: "https://foundation.mozilla.org/en/what-we-fund/",
      label: "Mozilla Foundation Funding",
      note: "Trustworthy-AI fellowships and awards — changes when new calls open",
    },
    {
      url: "https://sloan.org/grants/apply",
      label: "Sloan Foundation Grants",
      note: "Research grants incl. AI/computing — foundation primary page",
    },
    {
      url: "https://schmidtsciences.org/programs/",
      label: "Schmidt Sciences Programs",
      note: "AI2050 fellowships and science programs — high-value, low-competition",
    },
  ],

  India: [
    {
      url: "https://indiaai.gov.in/funding",
      label: "IndiaAI Funding",
      note: "Government AI grant calls and scheme openings",
    },
    {
      url: "https://www.startupindia.gov.in/content/sih/en/government-schemes.html",
      label: "Startup India Government Schemes",
      note: "AI-relevant startup funding schemes",
    },
    {
      url: "https://meity.gov.in/schemes-programmes",
      label: "MeitY Schemes and Programmes",
      note: "Ministry of Electronics and IT — AI and deep tech grants",
    },
    {
      url: "https://cse.iitk.ac.in/pages/Opportunities.html",
      label: "IIT Kanpur CSE Opportunities",
      note: "Research internship and fellowship announcements",
    },
    {
      url: "https://www.tcsion.com/scholarships/",
      label: "TCS iON Scholarships",
      note: "Industry scholarships for AI/tech students",
    },
    {
      url: "https://nerve.stpi.in/",
      label: "STPI NERVE CoE Nagpur",
      note: "AI/DeepTech startup incubation challenges",
    },
    {
      url: "https://iisc.ac.in/positions-open/",
      label: "IISc Bangalore Open Positions",
      note: "Research internships and project positions — India's top research university",
    },
    {
      url: "https://rbcdsai.iitm.ac.in/opportunities/",
      label: "IIT Madras RBCDSAI Opportunities",
      note: "Robert Bosch Centre for Data Science and AI — internships and fellowships",
    },
  ],

  SEA: [
    {
      url: "https://aisingapore.org/programmes/",
      label: "AI Singapore Programmes",
      note: "AIAP and other national AI programmes",
    },
    {
      url: "https://www.imda.gov.sg/how-we-can-help/ai-sandbox",
      label: "IMDA AI Sandbox Singapore",
      note: "Singapore government AI grants and sandboxes",
    },
    {
      url: "https://sea.ai/",
      label: "Sea AI Lab",
      note: "Research internship and fellowship postings",
    },
    {
      url: "https://www.dsaidirectorate.gov.sg/",
      label: "DSAIDirectorate Singapore",
      note: "Digital and AI directorate — grants and programmes",
    },
    {
      url: "https://peerlist.io/opportunities",
      label: "Peerlist Opportunities",
      note: "Strong SEA+India tech community — real postings land here first",
    },
    {
      url: "https://talent.alibaba.com",
      label: "Alibaba Talent Portal",
      note: "Search 'Qwen' or 'DAMO Academy' for AI research internships, Singapore-based roles most accessible internationally",
    },
    {
      url: "https://www.comp.nus.edu.sg/programmes/pg/",
      label: "NUS Computing Programmes",
      note: "Research attachments and AI programmes at Singapore's top CS school",
    },
    {
      url: "https://www.ntu.edu.sg/scse/admissions/programmes",
      label: "NTU SCSE Programmes",
      note: "AI research programmes and attachments",
    },
  ],

  Europe: [
    {
      url: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/horizon-results-platform",
      label: "EU Horizon Funding Opportunities",
      note: "Horizon Europe AI grants and calls — changes when new call opens",
    },
    {
      url: "https://digital-strategy.ec.europa.eu/en/activities/digital-programmes",
      label: "EU Digital Strategy Programmes",
      note: "AI and digital skills programmes from the EC",
    },
    {
      url: "https://www.turing.ac.uk/opportunities",
      label: "Alan Turing Institute Opportunities",
      note: "UK national AI institute — fellowships and grants",
    },
    {
      url: "https://ellis.eu/news",
      label: "ELLIS Network News",
      note: "European AI research network — fellowship and PhD announcements",
    },
    {
      url: "https://claire-ai.org/opportunities/",
      label: "CLAIRE AI Opportunities",
      note: "Confederation of Laboratories for AI Research in Europe",
    },
    {
      url: "https://jobs.lever.co/mistral",
      label: "Mistral AI Jobs Board (Lever)",
      note: "Applied Scientist / Research Engineer internships — Paris and London. Check for new intern postings as they appear and disappear frequently.",
    },
    {
      url: "https://x.ai/careers",
      label: "xAI Careers",
      note: "Watch for any fellowship or internship program announcements",
    },
    {
      url: "https://jobs.ashbyhq.com/perplexity",
      label: "Perplexity Jobs Board",
      note: "Internships in Belgrade (Serbia), Berlin (Germany), London (UK) — check for new intern postings",
    },
    {
      url: "https://ai.ethz.ch/education/fellowships.html",
      label: "ETH AI Center Fellowships",
      note: "Postdoc and doctoral fellowships at Europe's top technical university",
    },
    {
      url: "https://www.eu-startups.com/category/accelerators/",
      label: "EU-Startups Accelerator News",
      note: "Free directory — new EU accelerator cohort announcements (verify against official pages before curating)",
    },
  ],

  USA: [
    {
      url: "https://www.grants.gov/search-results.html?oppStatuses=forecasted%7Cposted&fundingCategories=ST&agencyCode=NSF",
      label: "grants.gov — NSF STEM (live feed)",
      note: "US government grants database — changes when NSF posts new AI calls",
    },
    {
      url: "https://www.nsf.gov/funding/programs.jsp?org=CISE",
      label: "NSF CISE Programs",
      note: "Computer and Information Science programs — AI funding calls",
    },
    {
      url: "https://www.darpa.mil/work-with-us/for-universities/cooperative-agreements",
      label: "DARPA University Programs",
      note: "AI research cooperative agreements from DARPA",
    },
    {
      url: "https://www.anthropic.com/careers",
      label: "Anthropic Careers",
      note: "Claude Corps and other fellowship-style programs",
    },
    {
      url: "https://research.google/careers/",
      label: "Google Research Careers",
      note: "Research residency and PhD fellowship postings",
    },
    {
      url: "https://ai.meta.com/research/",
      label: "Meta AI Research",
      note: "Research internship and fellowship announcements",
    },
    {
      url: "https://www.metacareers.com/careerprograms/research",
      label: "Meta Research Career Programs",
      note: "PhD internships, postdocs, and research roles — changes when new cohorts open",
    },
    {
      url: "https://openai.com/residency/",
      label: "OpenAI Residency",
      note: "Reopens annually — watch for 2027 cycle",
    },
    {
      url: "https://hai.stanford.edu/research/fellowship-programs",
      label: "Stanford HAI Fellowships",
      note: "Human-centered AI fellowship programs",
    },
    {
      url: "https://www.eecs.mit.edu/research/",
      label: "MIT EECS Research",
      note: "SuperUROP and research program announcements",
    },
  ],

  Australia: [
    {
      url: "https://www.csiro.au/en/work-with-us/funding-programs",
      label: "CSIRO Funding Programs",
      note: "Australia national science agency — AI and tech grants",
    },
    {
      url: "https://www.arc.gov.au/funding-research/current-and-recently-closed-funding-rules",
      label: "ARC Funding Rules",
      note: "Australian Research Council — AI-relevant grants",
    },
    {
      url: "https://www.industry.gov.au/science-technology-and-innovation/technology/artificial-intelligence",
      label: "Australian Dept of Industry — AI",
      note: "Government AI initiative funding announcements",
    },
    {
      url: "https://www.startupaus.org/programs",
      label: "StartupAus Programs",
      note: "Australian startup programs including AI accelerators",
    },
    {
      url: "https://cecc.anu.edu.au/study/study-options",
      label: "ANU Computing Study Options",
      note: "AI programs and research opportunities at Australia's top research university",
    },
    {
      url: "https://data61.csiro.au/en/Our-Research/Students-and-Careers",
      label: "CSIRO Data61 Students & Careers",
      note: "Australia's data-science arm — internships and PhD scholarships",
    },
  ],
};

// ─── Content hashing ──────────────────────────────────────────────────────────

/**
 * Fetches a page and extracts its meaningful text content. We strip nav,
 * footers, scripts, and styles — only the main body text matters for
 * detecting whether the actual opportunity content changed. A changed
 * cookie banner shouldn't trigger a re-scan.
 */
async function fetchPageContent(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AI-Opportunity-Radar/1.0; +https://mapd.cc)",
      "Accept": "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();

  // Strip scripts, styles, head, nav, footer — keep main body text only.
  // This is intentionally minimal: we're not scraping structured data here,
  // just detecting whether the meaningful content on the page changed.
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<[^>]+>/g, " ")        // strip all remaining HTML tags
    .replace(/\s+/g, " ")             // collapse whitespace
    .trim()
    .slice(0, 50_000);               // cap at 50k chars — enough for hash, not memory-unbounded

  return stripped;
}

function hashContent(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// ─── Hash persistence ─────────────────────────────────────────────────────────

async function loadHashes(region) {
  try {
    const data = await readFile(join(DATA_DIR, `hashes-${region}.json`), "utf8");
    return JSON.parse(data);
  } catch {
    return {}; // first run, no stored hashes
  }
}

async function saveHashes(region, hashes) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, `hashes-${region}.json`), JSON.stringify(hashes, null, 2), "utf8");
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Scans all primary sources for a region, returns those whose content
 * changed since last run as { url, label, note, content } objects.
 * Unchanged sources are skipped silently — only changes are signal.
 *
 * @param {string} region
 * @returns {Promise<{
 *   changed: Array<{url: string, label: string, note: string, content: string}>,
 *   skipped: number,
 *   errors: Array<{url: string, label: string, error: string}>
 * }>}
 */
export async function scanPrimarySources(region) {
  const sources = PRIMARY_SOURCES[region] || [];
  const storedHashes = await loadHashes(region);
  const currentHashes = { ...storedHashes };

  const changed = [];
  const errors = [];
  let skipped = 0;

  for (const source of sources) {
    try {
      console.log(`[source-monitor] Checking: ${source.label}`);
      const content = await fetchPageContent(source.url);
      const hash = hashContent(content);

      if (storedHashes[source.url] === hash) {
        console.log(`[source-monitor] Unchanged: ${source.label}`);
        skipped++;
      } else {
        console.log(`[source-monitor] CHANGED: ${source.label} (${storedHashes[source.url] ? "hash mismatch" : "first visit"})`);
        changed.push({ url: source.url, label: source.label, note: source.note, content });
        currentHashes[source.url] = hash;
      }
    } catch (err) {
      console.warn(`[source-monitor] Error fetching ${source.label}: ${err.message}`);
      errors.push({ url: source.url, label: source.label, error: err.message });
      // Don't update the stored hash on error — try again next week.
    }
  }

  // Save updated hashes only for successfully fetched sources.
  // Errored sources keep their old hash so they're rechecked next run.
  await saveHashes(region, currentHashes);

  return { changed, skipped, errors };
}
