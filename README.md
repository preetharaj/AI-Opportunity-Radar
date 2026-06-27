# AI Opportunity Radar

> Discover curated AI, ML and technology opportunities from leading organizations worldwide.

AI Opportunity Radar is an agent-assisted curation layer for students, researchers, founders and builders looking for high-signal opportunities across AI, ML and technology.

## Why It Exists

AI opportunities are scattered across university websites, research labs, foundations, accelerators and company career pages.

AI Opportunity Radar brings them together in one place so students, researchers, founders and builders can spend less time searching and more time applying.

## What It Does

- Grants
- Fellowships
- Courses
- Research internships
- Job internships
- Competitions
- Startup and builder programs

Regions:
- Global
- USA
- Europe
- India
- SEA
- Australia

## What You Get

- Curated AI/ML/tech opportunities
- Active and future opportunities only
- Closing soon labels
- Biweekly email digest
- Deadline reminders
- Official application links
- Email subscriptions

## Key Features

### Opportunity Discovery
Browse by category, region, deadline, status and relevance.

### Email Subscription
Subscribe with only an email address. No login required.

### Biweekly Digest
Receive curated opportunity updates every two weeks.

### Deadline Reminders
Get notified when relevant deadlines are approaching.

## Phase 3: Agent-Assisted Curation

Phase 3 adds two scheduled, automated jobs that help with curation work without touching the live catalog directly. Every change either job proposes goes through a normal GitHub pull request — nothing publishes without a human approving it first.

### Discovery pipeline
A weekly job searches one region at a time (rotating through India, SEA, Europe, USA, Australia, Global) for new opportunities, drafts them as catalog entries, and opens a pull request for review. It uses a local, free open-source model (Ollama) running inside GitHub Actions, falling back to a free-tier cloud model only if local inference isn't available. Every PR includes the search queries used, sources found, candidates proposed, anything explicitly rejected, and any uncertainty the agent flagged — so review is fast, not a blind trust call.

### Link-rot checker
A separate weekly job checks every source URL already in the catalog and flags anything that's broken (404, 410, server error, timeout, unreachable). It never edits the catalog itself — it opens a GitHub issue listing what failed, and a human decides whether to fix the link, update the entry, or remove it.

### What stays human
- No job can merge to `main`. Both only ever open a pull request or an issue.
- Discovery-value judgment (is this opportunity well-known enough to skip, is the deadline accurate, is the source credible) is still a manual review step — same bar as before Phase 3 existed.
- Zero qualifying candidates in a given week is treated as a normal result, not a failure — the job says so explicitly rather than going silent.

Full details: [`docs/PHASE3.md`](docs/PHASE3.md)

## Tech Stack

- Next.js
- React
- Tailwind CSS
- Turso / libSQL
- Resend
- Umami
- GitHub Actions
- Vercel

## Roadmap

### Current
- Opportunity discovery
- Region filters
- Email subscriptions
- Biweekly digest
- Deadline reminders
- Agent-assisted discovery (Phase 3)
- Automated link-rot checking (Phase 3)

### Planned
- Personalized recommendations
- Eligibility matching
- Opportunity tracking dashboard
- Saved opportunities
- AI-powered search

## Local Development

```bash
npm install
npm run db:init
npm run dev
```

## Documentation

- docs/DEPLOYMENT.md
- docs/OPERATIONS.md
- docs/PHASE3.md

MIT License
