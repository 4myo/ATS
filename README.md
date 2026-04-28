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

## Project Structure

```text
app/
  components/        Shared UI and app components
  lib/               Supabase client, i18n, PDF helpers, AI helpers
  routes/            React Router screens
  routes.ts          Route definitions
docs/
  supabase-schema.sql
public/
  _redirects         Netlify SPA fallback
supabase/
  functions/
    analyze-candidate/
    signup-with-rate-limit/
```

## Requirements

- Node.js 20+
- npm
- Supabase project
- Google Gemini API key
- Supabase CLI for deploying Edge Functions

## Environment Variables

Create a local `.env` file for the frontend:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Set these secrets for Supabase Edge Functions:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

The analyzer also accepts `GEMINICLIENT_KEY` as a fallback name, but `GEMINI_API_KEY` is recommended.

## Supabase Setup

Run the schema in:

```text
docs/supabase-schema.sql
```

The schema creates:

- `jobs`
- `candidates`
- `signup_rate_limits`
- row-level security policies for per-user data

Create a private Storage bucket named:

```text
resumes
```

Recommended Storage policies are documented at the bottom of `docs/supabase-schema.sql`. CV PDFs are uploaded into this bucket and opened through signed URLs from the Candidate Details screen.

## Edge Functions

This project uses two Supabase Edge Functions:

- `analyze-candidate`: analyzes candidate CV text with Gemini and writes structured results back to `candidates`
- `signup-with-rate-limit`: creates users with basic signup rate limiting

Deploy them with:

```bash
supabase functions deploy analyze-candidate
supabase functions deploy signup-with-rate-limit
```

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

Run the production server:

```bash
npm run start
```

## Deployment Notes

For Netlify, keep `public/_redirects`:

```text
/* /index.html 200
```

This allows direct links such as `/auth/callback`, `/jobs/:id`, and `/applicants/:id` to work in the SPA.

For Supabase OAuth, make sure your production callback URL is configured in Supabase and Google Cloud OAuth settings, for example:

```text
https://your-domain.com/auth/callback
```

## AI and Fairness Notes

The AI analyzer is calibrated to avoid overly generous scores and uses stricter score bands. It should evaluate only job-relevant evidence such as required skills, relevant experience, role responsibilities, measurable achievements, certifications, and project/work history.

The analyzer is instructed not to infer or use protected characteristics such as age, gender, race, nationality, ethnicity, religion, disability, marital status, pregnancy, sexual orientation, or family status. It also avoids using names, pronouns, graduation years, dates of birth, photos, nationality, address, or career gaps as negative signals.

Scores and AI-generated notes are intended to help recruiters review candidates. They should not be treated as final hiring decisions.