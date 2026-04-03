# GradHunt

GradHunt is a full-stack job search web app for interns and new grads. It scrapes jobs from multiple sources, lets users upload a resume for AI analysis, recommends and ranks jobs against that resume, and provides account features like saved resumes, applied-job history, email verification, and password reset.

## What It Does

- Search tech jobs by role, location, and job type
- Aggregate jobs from:
  - LinkedIn
  - Indeed
  - ZipRecruiter
- Upload a resume and analyze it with OpenAI
- Use resume analysis to:
  - suggest better search roles
  - search across multiple related role titles
  - rank jobs by resume match score
- Hide jobs the user has already marked as applied
- Save resume history and applied-job history for verified users
- Support account creation, login/logout, forgot password, and email verification

## Current Product Features

### Job Search

- Default search role is `software engineer`
- Filter by:
  - location
  - `full-time` or `intern`
  - hide already applied jobs
- Pagination is enabled
- Search results are cached on the backend to avoid re-scraping when changing pages

### Resume Features

- Upload resume files:
  - `pdf`
  - `doc`
  - `docx`
  - `txt`
- Extract resume text and analyze it with OpenAI
- Generate structured resume data such as:
  - target roles
  - skills
  - tools/frameworks
  - strengths
  - preferred locations
  - suggested search keywords
- Resume-driven search can search multiple related role titles instead of only one exact title

### Matching and Ranking

- Jobs are ranked against the uploaded resume
- Match score considers:
  - title and role alignment
  - skill overlap
  - tool/framework overlap
  - preferred location
  - experience-level fit
  - strength overlap
- Search results can include resume-driven role variants for broader recommendations

### Account Features

- Register and log in with email/password
- Change password
- Forgot password / reset password flow
- Email verification flow
- Saved resumes and applied-job history are available for verified users
- Profile modal includes:
  - overview
  - settings
  - saved resume history
  - applied-job history

## Tech Stack

- Frontend:
  - React 19
  - Vite
- Backend:
  - Node.js
  - Express
- Database:
  - MongoDB
  - Mongoose
- AI:
  - OpenAI API
- Scraping / parsing:
  - Playwright
  - Python scraper for LinkedIn
  - `pdf-parse`
- Email:
  - Resend

## Project Structure

```text
GradHunt/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   │   └── scrapers/
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── styles/
│   │   └── App.jsx
└── README.md
```

## Prerequisites

Make sure you have these installed:

- Node.js 18+
- npm
- MongoDB connection string
- Python 3

Optional but recommended:

- Playwright browser binaries

## Environment Variables

Create `backend/.env` and configure the values you need.

### Required For Core App

```env
PORT=3000
MONGODB_URI=your_mongodb_connection_string
AUTH_SECRET=your_long_random_secret
```

### Required For Resume AI Features

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_RESUME_MODEL=gpt-4.1-mini
OPENAI_JOB_MODEL=gpt-4.1-mini
```

### Required For Email Features

```env
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM="GradHunt <onboarding@resend.dev>"
FRONTEND_URL=http://localhost:5173
```

Notes:

- `onboarding@resend.dev` is fine for testing, but only for limited Resend test sending.
- For real user email delivery, use a verified sender domain.
- If `OPENAI_API_KEY` is missing, resume analysis and AI job-summary features will not work.
- If `MONGODB_URI` is missing or MongoDB is unavailable, auth/history features will not work correctly.

## Installation

Clone the repository:

```bash
git clone https://github.com/Mei0707/GradHunt.git
cd GradHunt
```

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies:

```bash
cd ../frontend
npm install
```

Install Playwright Chromium if needed:

```bash
cd ../backend
npx playwright install chromium
```

## Running The App

Start the backend:

```bash
cd backend
npm start
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://localhost:3000`

## Main API Areas

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/request-verification`
- `POST /api/auth/verify-email`

### Resume

- `POST /api/resume/upload`
- `POST /api/resume/analyze`
- `POST /api/resume/save`
- `GET /api/resume/history`

### Jobs

- `POST /api/jobs/search`
- `GET /api/jobs/applied`
- `POST /api/jobs/applied`
- `POST /api/jobs/details`

## Typical User Flow

1. Register an account.
2. Verify the email or continue exploring in limited mode.
3. Upload a resume.
4. Let the app analyze the resume.
5. Choose whether you are currently looking for internships or full-time/new grad roles.
6. Search jobs.
7. Review ranked recommendations and open job details.
8. Mark jobs as applied.
9. View saved resumes and applied jobs in the profile.

## Known Limitations

- Scraped job sources can be unstable and may change layout or rate-limit requests.
- Indeed and ZipRecruiter may occasionally return fewer jobs than expected.
- LinkedIn scraping is rate-limit sensitive.
- Some job descriptions from external sources can still be incomplete.
- Email sending with `onboarding@resend.dev` is only suitable for testing.

## Development Notes

- Backend search results are cached to reduce repeated scraping.
- Resume-driven searches can expand into multiple related role searches and then merge the results.
- Verified email is required for certain saved-history features.
- The frontend currently calls the backend at `http://localhost:3000` directly.

## Future Improvements

- Improve scraper stability and source coverage
- Add richer job-detail extraction
- Improve recommendation quality further
- Add stronger deduplication between sources
- Move frontend API base URL to env configuration
- Add tests for key backend services and auth flows

