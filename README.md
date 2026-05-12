# Smart ATS

Smart ATS is a React-based applicant tracking system for managing job postings, uploading candidate CVs, and using AI-assisted analysis to support recruiter review. The app stores candidate and job data in Supabase, keeps CV PDFs in private Supabase Storage, and uses a Supabase Edge Function with Google Gemini to extract structured candidate insights.

The AI score is designed as a review aid, not an automated hiring decision. The analyzer includes fairness-oriented scoring instructions that avoid protected characteristics and focus on job-relevant evidence.

## Features

- Google and email authentication with Supabase Auth
- Candidate management with stages: Applied, Screening, Interview, Offer, Rejected
- Job posting creation, detail pages, and deletion
- CV PDF upload with first-page preview
- Stored CV opening from Candidate Details via private Supabase signed URLs
- AI analysis for:
  - ATS match score
  - Slovenian summary
  - strengths and concerns
  - relevant skills
  - education
  - skill profile radar data
  - AI writing signal as a review cue
- Dashboard charts for pipeline, stage distribution, and candidate metrics
- Candidate search and filtering by job position
- Headhunter workspace for public/manual sourcing, lead editing, attached source notes, GitHub public profile search, CSV import/export, and conversion into candidates
- Light/dark theme support
- Slovenian and English UI strings
- Netlify-friendly SPA redirects

## Tech Stack

- React 19
- React Router 7
- TypeScript
- Vite
- Tailwind CSS 4
- Radix UI primitives
- lucide-react icons
- Recharts
- Zustand
- Supabase Auth, Database, Storage, and Edge Functions
- Google Gemini via `@google/genai`
- `pdfjs-dist` for PDF text/image handling
- `tesseract.js` for OCR fallback


## Requirements

- Node.js 20+
- npm
- Supabase project
- Google Gemini API key
- Supabase CLI for deploying Edge Functions

After changing AI ranking instructions, redeploy `analyze-candidate`.

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

The app runs at:

```text
http://localhost:5173
```

## Build and Type Check

Run TypeScript checks:

```bash
npm run typecheck
```

Create a production build:

```bash
npm run build
```

## AI and Fairness Notes

The AI analyzer is calibrated to avoid overly generous scores and uses stricter score bands. It should evaluate only job-relevant evidence such as required skills, relevant experience, role responsibilities, measurable achievements, certifications, and project/work history.

The analyzer is instructed not to infer or use protected characteristics such as age, gender, race, nationality, ethnicity, religion, disability, marital status, pregnancy, sexual orientation, or family status. It also avoids using names, pronouns, graduation years, dates of birth, photos, nationality, address, or career gaps as negative signals.

Scores and AI-generated notes are intended to help recruiters review candidates. They should not be treated as final hiring decisions.

## Current Sourcing Limits and Roadmap

The Headhunter workspace intentionally works with manually added data, consented information, CSV imports, and publicly available GitHub profile search. The test version does not include paid enrichment, private social-network scraping, automated consent management, or broad web search connectors, mainly to keep the implementation within cost and API-access limits.

Planned next steps include richer document handling for sourced talent, explicit consent tracking, additional official source connectors, and more complete profile enrichment where the legal basis and integration costs are clear.
