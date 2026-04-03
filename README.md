# GradHunt

> AI-enhanced job search and application support platform for interns, students, and new graduates.

GradHunt is a full-stack web application that helps early-career candidates discover, evaluate, and manage job opportunities more efficiently. It aggregates jobs from multiple sources, analyzes uploaded resumes, ranks opportunities using a hybrid recommendation system, and supports the application process with AI-powered tools like personalized cover letter generation.

---

## Overview

Job searching for internships and new graduate roles is often repetitive and fragmented. Students typically search across multiple job boards, manually compare listings, repeatedly upload resumes, and spend time deciding which roles are actually a good fit.

GradHunt was built to reduce that friction by combining:

* **Multi-source job aggregation**
* **Resume-based personalization**
* **Hybrid recommendation and ranking**
* **Application tracking**
* **AI-assisted application support**

The goal is not just to show more jobs, but to show **better and more relevant jobs** with less repeated effort.

---

## Key Features

### 1) Multi-Source Job Search

GradHunt aggregates internship and entry-level jobs from multiple external sources, including:

* LinkedIn
* Indeed
* ZipRecruiter

Users can search by:

* **Role / keyword**
* **Location**
* **Job type** (`intern`, `full-time`)

This provides a more complete search experience than relying on a single platform.

---

### 2) Resume Upload and AI Resume Analysis

Users can upload resumes in common formats such as:

* `pdf`
* `doc`
* `docx`
* `txt`

After upload, the backend extracts text and sends it through an AI analysis pipeline to generate a structured candidate profile.

The extracted profile includes signals such as:

* target roles
* experience level
* technical skills
* tools and frameworks
* education
* preferred locations
* suggested search keywords

This profile becomes the foundation for personalized search and recommendation.

---

### 3) Resume-Driven Job Recommendation

Instead of relying only on exact keyword matching, GradHunt ranks jobs using a **hybrid recommendation model** that combines:

* **Heuristic matching** (explicit signals)
* **Semantic similarity** (embedding-based relevance)

This allows the platform to recommend jobs that are not just textually similar, but also contextually aligned with the candidate’s background.

---

### 4) AI Cover Letter Generation

Once a resume has been uploaded and analyzed, users can generate a formal cover letter for a selected job.

The cover letter is generated using:

* the structured resume profile
* selected job metadata
* job description content

This helps reduce repetitive writing effort during the application process.

---

### 5) Applied Job Tracking

GradHunt supports lightweight job application management by allowing users to:

* mark jobs as applied
* store applied-job history
* review previous applications
* hide previously applied jobs from future searches

This helps users avoid duplicate effort during long job searches.

---

### 6) Authentication and Account Features

GradHunt includes standard account and security workflows such as:

* user registration and login
* email verification
* password reset
* password change
* saved resume history
* profile management

---

## System Architecture

GradHunt follows a **client-server architecture** with a modular backend.

### Frontend

Built with:

* **React**
* **Vite**
* **CSS**

Frontend responsibilities include:

* rendering job search UI
* managing filters and pagination
* resume upload flow
* displaying match results
* cover letter interaction
* authentication state handling

Example UI modules:

* `SearchForm`
* `JobCard`
* `Pagination`
* `ResumeUpload`
* `AuthModal`

---

### Backend

Built with:

* **Node.js**
* **Express**

Backend responsibilities include:

* handling API requests
* orchestrating scrapers
* processing resume uploads
* running recommendation logic
* managing authentication and account workflows

Representative backend modules:

* `jobController.js`
* `resumeController.js`
* `authController.js`

---

### Database

Built with:

* **MongoDB**
* **Mongoose**

Used to persist:

* user accounts
* saved resumes
* applied jobs
* auth-related tokens

---

### AI and Processing Layer

AI and enrichment functionality includes:

* resume analysis
* cover letter generation
* embedding-based job ranking
* optional job detail summarization

Services are powered using:

* **OpenAI Responses API**
* **OpenAI Embeddings API**

---

## How Core Features Are Implemented

## 1) Job Aggregation Pipeline

### How it works

When a user searches for a job, the backend sends the query to multiple scraper modules in parallel.

Each scraper returns normalized job objects in a shared format.

### Implementation approach

The backend uses parallel scraper execution with:

* timeouts
* `Promise.allSettled()`

This design is useful because it allows the system to tolerate partial failure.

### Why this matters

If one source fails or becomes slow, the entire search should still return results from the remaining sources.

### Advantage

* More resilient than sequential scraping
* Faster total response time
* Easier to extend with additional sources

### Disadvantage

* Scrapers are inherently brittle
* External site changes can break extraction logic
* Rate limiting / bot protection can reduce reliability

---

## 2) Deduplication Logic

A major problem in job aggregation is that the same role may appear on multiple platforms.

### Deduplication strategy

GradHunt uses two duplicate signals:

#### Exact duplicate key

* canonicalized job URL

#### Fuzzy duplicate key

* normalized `title + company + location`

### How duplicate resolution works

If multiple records refer to the same role, the system keeps the richer version and merges:

* alternate URLs
* alternate IDs
* source metadata

### Why this method is used

A pure exact-match strategy would miss cross-platform duplicates, while a fully fuzzy approach may create false positives.

This hybrid deduplication design balances:

* **precision** (avoid merging unrelated jobs)
* **recall** (catch likely duplicates)

### Advantage

* Cleaner search results
* Less repeated job noise
* Better user experience

### Disadvantage

* Fuzzy matching can still produce occasional incorrect merges
* Requires careful normalization rules

---

## 3) Resume Analysis Pipeline

### How it works

When a resume is uploaded:

1. The file is stored temporarily.
2. Text is extracted from the document.
3. Extracted content is sent to an AI analysis step.
4. The response is converted into a structured candidate profile.

### Parsing / extraction tools

Examples include:

* `pdf-parse`
* fallback extraction tools for unsupported formats

### Why use a structured profile instead of raw resume text?

Raw resume text is noisy and inconsistent. A structured intermediate representation makes downstream recommendation logic much easier to implement.

### Example structured fields

* skills
* target roles
* experience level
* education
* preferred locations
* strengths

### Advantage

* Better downstream recommendation quality
* Easier feature engineering
* More interpretable than using raw text alone

### Disadvantage

* AI extraction may occasionally omit or over-generalize information
* Depends on resume quality and formatting

---

## 4) Resume-Driven Search Expansion

A user may search for one role such as `software engineer`, but their resume may also fit:

* backend engineer
* platform engineer
* full stack engineer
* new grad software engineer

### How it works

GradHunt expands the search using:

* current user-entered role
* AI-inferred target roles
* suggested search keywords

The system then:

* removes duplicates
* filters by job type
* limits the number of expanded role variants

### Why use this method?

A single keyword query often misses relevant jobs due to title variation across companies.

### Advantage

* Increases recall
* Better coverage for real-world title variation
* Reduces manual searching effort

### Disadvantage

* Too much expansion can introduce noise
* Requires reasonable limits to avoid irrelevant results

---

## 5) Hybrid Job Matching Algorithm

This is one of the most important parts of GradHunt.

The system ranks jobs using two complementary signals:

### A. Heuristic Matching

This captures **explicit alignment** between the resume and a job.

Examples of heuristic signals include:

* title / role match
* skills overlap
* tools / frameworks overlap
* location alignment
* experience-level fit
* education / strengths overlap

This score is fast and interpretable.

---

### B. Embedding-Based Semantic Similarity

This captures **semantic alignment** beyond exact keyword overlap.

For example, a resume mentioning:

* `distributed systems`
* `backend services`
* `microservices`

may still align well with a job that emphasizes:

* `platform engineering`
* `service reliability`
* `API infrastructure`

—even if the exact words are not identical.

### Formula used

Semantic similarity is computed using **cosine similarity** between the resume embedding and job embedding:

[
\text{similarity}(A, B) = \frac{A \cdot B}{|A| \cdot |B|}
]

Where:

* (A) = resume vector
* (B) = job vector
* (A \cdot B) = dot product
* (|A|) and (|B|) = vector magnitudes

### Why cosine similarity?

Cosine similarity measures **directional similarity** between vectors rather than raw magnitude.

This is useful for text embeddings because we care more about **semantic closeness** than document length.

### Advantage

* Captures semantic fit beyond keywords
* Improves ranking quality for varied job descriptions

### Disadvantage

* More expensive than rule-based scoring
* Harder to explain directly to users
* Depends on embedding quality

---

## 6) Hybrid Final Match Score

The final ranking score blends heuristic and semantic signals.

### Example blend

[
\text{FinalScore} = 0.7 \cdot \text{HeuristicScore} + 0.3 \cdot \text{SemanticScore}
]

### Why hybrid scoring is better than using only one method

#### If using only heuristics:

* strong explainability
* weak semantic generalization

#### If using only embeddings:

* strong semantic generalization
* weaker transparency and controllability

### Why use both?

The hybrid approach balances:

* **interpretability**
* **ranking quality**
* **practical implementation simplicity**

### Advantage

* Better ranking quality than pure keyword match
* More robust across job description variation

### Disadvantage

* Requires score normalization and tuning
* Weights may need future optimization

---

## Data Structures and Why They Were Chosen

## 1) `Map` for Search Cache

GradHunt uses an in-memory JavaScript `Map` for caching repeated searches.

### Why use `Map`?

Because cache lookup needs to be fast.

### Key

A normalized query signature such as:

* `role + location + jobType`

### Value

Stores:

* cached results
* expiration time
* optional in-flight promise

### Why `Map` is a good fit

* average **O(1)** lookup
* simple key-value semantics
* efficient for repeated reads

### Advantage

* Faster repeated queries
* Reduces unnecessary scraping
* Improves UX and response time

### Disadvantage

* In-memory cache is not shared across multiple servers
* Cache disappears on restart
* Requires expiration strategy

---

## 2) `Set` for Deduplication and Filtering

GradHunt uses `Set` for:

* duplicate detection
* applied job filtering
* alternate ID / URL tracking

### Why use `Set`?

Because membership checks are frequent and should be efficient.

### Why not use arrays?

An array would require repeated linear scans.

### Advantage

* average **O(1)** membership check
* simple duplicate prevention
* ideal for URL / ID tracking

### Disadvantage

* only stores membership, not rich metadata
* may require additional maps/objects for associated details

---

## 3) MongoDB Document Models

MongoDB is used for persistent user and account data.

### Why MongoDB?

Because the project benefits from flexible document storage for entities like:

* users
* saved resumes
* applied jobs
* auth tokens

### Why this works well here

Resume analysis output and job-related metadata can be semi-structured and evolve over time.

### Advantage

* flexible schema
* easy JSON-like integration with Node.js
* good for iterative development

### Disadvantage

* less rigid relational structure
* complex joins are not as natural as SQL systems

---

## Authentication and Security Design

GradHunt includes several standard security mechanisms.

### Implemented protections

* password hashing using PBKDF2 + SHA-512
* token-based email verification
* password reset tokens with expiration
* protected authenticated routes
* rate limiting on sensitive auth operations

### Why these are important

Because even student-side portfolio projects should demonstrate secure handling of:

* credentials
* account recovery
* identity verification

### Advantage

* stronger production realism
* better account safety

### Disadvantage

* more implementation complexity than a basic demo app

---

## Trade-Offs in the Current Design

### Why scraping instead of official APIs?

Many job sources have limited or unavailable public APIs for this exact use case.

### Advantage

* broader coverage
* more flexible data collection

### Disadvantage

* lower reliability
* maintenance burden
* legal / policy considerations depending on platform terms

---

### Why use AI analysis instead of pure regex parsing?

Resume content is highly variable and difficult to normalize with fixed rules alone.

### Advantage

* better generalization across formats
* richer structured profile extraction

### Disadvantage

* extra cost and latency
* occasional inconsistency

---

### Why use a hybrid ranking system instead of a learned ranking model?

A fully trained ranking model would require significant labeled data such as:

* clicks
* saves
* applies
* long-term interaction history

### Why hybrid is appropriate now

For an early-stage system, a hybrid heuristic + embedding approach is easier to implement and easier to reason about.

### Advantage

* practical and strong baseline
* easier to debug than black-box ML ranking

### Disadvantage

* not yet fully personalized from long-term behavior

---

## Current Limitations

Current limitations of the project include:

* scraper fragility due to external site changes
* dependence on third-party services (OpenAI, MongoDB, Resend)
* incomplete data consistency across sources
* no learned ranking from real user feedback loops yet
* recommendation quality still depends on resume quality and extraction accuracy

---

## Future Improvements

Planned or natural future extensions include:

### Recommendation and Personalization

* learned ranking from click/apply behavior
* stronger weighting calibration
* user feedback loops

### Product Features

* saved jobs
* alerts for new matching jobs
* richer application analytics
* notes per job
* exportable application history

### Infrastructure / Engineering

* production deployment hardening
* automated testing
* observability and monitoring
* stronger auth flows (OAuth / session hardening)
* distributed or persistent cache

---

## Tech Stack

### Frontend

* React
* Vite
* CSS

### Backend

* Node.js
* Express
* Mongoose

### Database

* MongoDB

### AI / NLP

* OpenAI Responses API
* OpenAI Embeddings API

### Scraping / Parsing

* Playwright
* Python
* `pdf-parse`

### Email / Auth Support

* Resend

---

## Example Project Structure

```bash
GradHunt/
├── backend/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   │   ├── scrapers/
│   │   ├── jobMatchingService.js
│   │   ├── resumeAnalysisService.js
│   │   └── coverLetterService.js
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   └── App.jsx
│   └── vite.config.js
└── README.md
```

---

## Why This Project Matters

GradHunt is not just a search UI. It is a practical example of how to combine:

* full-stack engineering
* AI-assisted personalization
* recommendation logic
* document processing
* user workflow design

into a real-world product.

It demonstrates how software can reduce repeated effort in a workflow that many students struggle with: finding relevant jobs and managing the application process efficiently.

---

## Author

**Qiaowen Mei**
