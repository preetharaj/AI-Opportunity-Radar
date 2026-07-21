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
      url: "https://www.gofractional.com/jobs",
      label: "Go Fractional — Jobs [fractional_job]",
      note: "Primary fractional-executive job board — new fractional CxO/lead roles appear here first",
    },
    {
      url: "https://www.fractionaljobs.io",
      label: "Fractional Jobs — Board [fractional_job]",
      note: "Curated fractional roles board — fractional head-of/exec listings",
    },
    {
      url: "https://www.gofractional.com/blog",
      label: "Go Fractional — Blog [fractional_job]",
      note: "Announcements + new-roles posts from Go Fractional",
    },
    {
      url: "https://www.fractionaljobs.io/blog",
      label: "Fractional Jobs — Blog [fractional_job]",
      note: "New roles + market announcements from Fractional Jobs",
    },
    {
      url: "https://arc.dev/remote-jobs/data-science",
      label: "Arc.dev — Fractional AI Roles (Worldwide) [fractional_job]",
      note: "Arc Exclusive fractional/part-time AI, ML, and Computer Vision roles — filter for PT and Fractional listings; changes when new roles go live",
    },
    {
      url: "https://www.indeed.com/q-fractional-chief-ai-officer-jobs.html",
      label: "Indeed — Fractional Chief AI Officer (Global) [fractional_job]",
      note: "Aggregated CAIO/fractional AI leadership postings — filter carefully, exclude non-AI roles; changes daily",
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
      url: "https://www.flexiple.com/freelance-jobs",
      label: "Flexiple — Senior Freelance India [fractional_job]",
      note: "India-focused senior freelance/fractional tech roles — verify fractional framing per listing",
    },
    {
      url: "https://jobs.lever.co/levelai",
      label: "Level AI Jobs Board (Lever) [internship]",
      note: "Noida/Bangalore AI/agentic CX roles — watch for new Research Intern (RL) postings",
    },
    {
      url: "https://osv-chegg.wd5.myworkdayjobs.com/en-US/Chegg",
      label: "Chegg India Careers (Workday) [internship]",
      note: "AI-native software engineering internships, Delhi — has real application deadlines, check each posting",
    },
    {
      url: "https://ag.wd3.myworkdayjobs.com/en-US/airbus",
      label: "Airbus India Careers (Workday) [internship]",
      note: "Recurring AI/ML/GenAI internship postings in Bengaluru — rolling pipeline, new variants appear often",
    },
    {
      url: "https://mwirelabs.com/northeast-india-ai-research-fellowship/",
      label: "MWire Labs — Northeast India AI Research Fellowship [fellowship]",
      note: "Rolling remote NLP research fellowship, Shillong-based AI/language-tech company — check for cohort/status changes",
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
      url: "https://www.glints.com/opportunities/jobs/explore?jobTypes=CONTRACT",
      label: "Glints SEA — Contract/Interim [fractional_job]",
      note: "SEA contract/interim tech roles — only genuinely fractional listings qualify",
    },
    {
      url: "https://arc.dev/remote-jobs/details/applied-ai-engineer-rag-knowledge-systems-ww-pt-p2vgi09suh",
      label: "Arc.dev — Applied AI Engineer RAG (WW, Singapore overlap) [fractional_job]",
      note: "Arc Exclusive part-time RAG/LLM engineer worldwide with Singapore timezone overlap — monitor for status changes",
    },
    {
      url: "https://razer.wd3.myworkdayjobs.com/en-US/careers",
      label: "Razer Careers (Workday) [internship]",
      note: "Agentic AI Pod internships (LLM/RAG/agent orchestration), Singapore — verify each posting is core AI, not general gaming eng",
    },
    {
      url: "https://acronis.wd502.myworkdayjobs.com/en-US/acronis_careers",
      label: "Acronis Careers (Workday) [internship]",
      note: "Machine Learning Intern roles in Singapore R&D — cybersecurity ML focus",
    },
    {
      url: "https://www.opswat.com/careers/open-positions",
      label: "OPSWAT Careers [internship]",
      note: "Agentic AI / AI Engineering Intern roles, Ho Chi Minh City, Vietnam",
    },
    {
      url: "https://apply.workable.com/shae-group/j/308F8AFF4D",
      label: "Shae Group — Fractional CTO/AI Strategy Council [fractional_job]",
      note: "Hourly contractor AI advisory role, offshore-friendly to Singapore/Malaysia/SEA — check status periodically",
    },
    {
      url: "https://www.mycareersfuture.gov.sg/companies/easmed-asia-201119016K",
      label: "EASMED ASIA Careers (MyCareersFuture) [fractional_job]",
      note: "Singapore medtech distributor — watch for Fractional CTO / AI-ML roadmap postings",
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
      url: "https://www.gofractional.com/jobs?location=Europe",
      label: "Go Fractional — Europe filter [fractional_job]",
      note: "Europe-region fractional roles view — changes when new EU/UK roles post",
    },
    {
      url: "https://arc.dev/remote-jobs/details/senior-ai-technical-advisor-part-time-uk-eu-oqzau2emhc",
      label: "Arc.dev — Senior AI Technical Advisor PT UK/EU [fractional_job]",
      note: "Arc Exclusive part-time AI advisory role for UK/EU timezone — monitor for status changes",
    },
    {
      url: "https://job-boards.eu.greenhouse.io/axiomaticai",
      label: "Axiomatic_AI Jobs Board (Greenhouse) [internship]",
      note: "AI-for-scientific-reasoning research lab, Barcelona — multiple rolling research/engineering internships",
    },
    {
      url: "https://jobs.ashbyhq.com/manex",
      label: "Manex AI Jobs Board (Ashby) [internship]",
      note: "AI Software Engineer / Forward Deployed Engineer internships, Munich",
    },
    {
      url: "https://cadence.wd1.myworkdayjobs.com/en-US/External_Careers",
      label: "Cadence Careers (Workday) [internship]",
      note: "AI-driven EDA/chip-design internships across Europe — recurring annual program",
    },
    {
      url: "https://careers.thalesgroup.com/global/en/studentandgraduates2",
      label: "Thales Student & Graduate Careers [internship]",
      note: "AI technology/AI engineer internships, Gorgonzola Italy — recurring, check each new posting for AI-core content",
    },
    {
      url: "https://lombardodier.wd3.myworkdayjobs.com/en-US/Lombard_Odier_Careers",
      label: "Lombard Odier Careers (Workday) [internship]",
      note: "Active GenAI/RAG/agentic-workflow internship pipeline, Geneva — several distinct roles rotate regularly",
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
      url: "https://www.gofractional.com/jobs?location=United+States",
      label: "Go Fractional — US filter [fractional_job]",
      note: "US-region fractional roles view — changes when new US roles post",
    },
    {
      url: "https://arc.dev/remote-jobs/details/applied-ai-engineer-us-pt-osiav6eeep",
      label: "Arc.dev — Applied AI Engineer PT USA [fractional_job]",
      note: "Arc Exclusive part-time applied AI engineer (Vertex AI, Gemini, agentic) — monitor for status changes",
    },
    {
      url: "https://www.indeed.com/q-fractional-chief-ai-officer-jobs.html?l=United+States",
      label: "Indeed — Fractional AI Officer USA [fractional_job]",
      note: "US-scoped CAIO and fractional AI leadership postings on Indeed — exclude non-AI roles",
    },
    {
      url: "https://www.procurityai.net/careers",
      label: "Procurity.AI Careers [fractional_job]",
      note: "Fractional CTO role for ProcurityIQ, an AI govtech procurement platform — direct company careers page",
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
      url: "https://www.expert360.com/jobs",
      label: "Expert360 AU — Interim/Advisory [fractional_job]",
      note: "Australian consulting/interim exec marketplace — public listings only, fractional framing required",
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
