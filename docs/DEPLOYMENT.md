# Deployment Guide

## Phase-2 Deployment (Vercel + mapd.cc)

### 1. Backup Phase-0

```bash
git checkout main
git pull
git checkout -b phase-0-backup
git push origin phase-0-backup
```

### 2. Deploy to Vercel

- Import GitHub repository
- Framework: Next.js
- Add environment variables

### 3. Environment Variables

Required:

- SITE
- NEXTAUTH_URL
- AUTH_SECRET
- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- RESEND_API_KEY
- EMAIL_FROM
- CRON_SECRET
- BIWEEKLY_DIGEST_START_DATE

### 4. Connect mapd.cc

Add domain in Vercel and configure DNS records.

### 5. GitHub Actions Secrets

- SITE_URL=https://mapd.cc
- CRON_SECRET=<same as Vercel>

### 6. Redirect Legacy Site

Redirect:
https://preetharaj.github.io/AI-Opportunity-Radar/

to

https://mapd.cc
