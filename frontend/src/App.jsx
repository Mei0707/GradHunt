import { useState, useEffect } from "react";
import './App.css';
import JobCard from './components/JobCard/JobCard';
import SearchForm from './components/SearchForm/SearchForm';
import Pagination from "./components/Pagination/Pagination";
import ResumeUpload from './components/ResumeUpload/ResumeUpload';
import AuthModal from './components/AuthModal/AuthModal';

function App() {
  const DEFAULT_SEARCH = { role: 'software engineer', location: 'New York', jobType: 'full-time' };
  const AUTH_STORAGE_KEY = 'gradhunt-auth';
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentSearch, setCurrentSearch] = useState(DEFAULT_SEARCH);
  const [uploadedResume, setUploadedResume] = useState(null);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [isJobDetailsLoading, setIsJobDetailsLoading] = useState(false);
  const [jobDetailsError, setJobDetailsError] = useState(null);
  const [authState, setAuthState] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authModalMode, setAuthModalMode] = useState(null);
  const [savedResumes, setSavedResumes] = useState([]);
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [applyPromptJob, setApplyPromptJob] = useState(null);

  const readJsonResponse = async (response) => {
    const rawText = await response.text();
    try {
      return rawText ? JSON.parse(rawText) : {};
    } catch (error) {
      throw new Error(`The backend returned an invalid response (${response.status}).`);
    }
  };

  const searchJobs = async (role, location, page = 1, resumeProfileOverride = null, jobType = currentSearch.jobType || DEFAULT_SEARCH.jobType) => {
    setIsLoading(true);
    setError(null);
    
    console.log(`Searching for ${role} in ${location}, page ${page}, type ${jobType}`);

    try {
      const payload = {
        role,
        location,
        page,
        jobType,
        resumeProfile: resumeProfileOverride || uploadedResume?.analysis || null,
      };
      console.log('Search payload:', payload);
      
      const response = await fetch('http://localhost:3000/api/jobs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authState?.token ? { Authorization: `Bearer ${authState.token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Received ${data.jobs?.length} jobs from career sites, total: ${data.count}, pages: ${data.totalPages}`);
      
      setJobs(data.jobs || []);
      setCount(data.count || 0);
      setCurrentPage(data.currentPage || page);
      setTotalPages(data.totalPages || 1);

      // Save current search terms for pagination
      setCurrentSearch({ role, location, jobType });
    } catch (error) {
      console.error('Search error:', error);
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        setError('Could not reach the backend at http://localhost:3000. Please make sure the backend is running and then try again.');
      } else {
        setError(error.message);
      }
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    
    // Scroll to top when changing pages
    window.scrollTo(0, 0);
    
    searchJobs(currentSearch.role, currentSearch.location, newPage, null, currentSearch.jobType);
  };

  useEffect(() => {
    // Initial search
    searchJobs(DEFAULT_SEARCH.role, DEFAULT_SEARCH.location);
  }, []);

  const fetchSavedResumes = async (token) => {
    if (!token) {
      setSavedResumes([]);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/resume/history', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load saved resumes.');
      }

      setSavedResumes(data.resumes || []);
    } catch (error) {
      console.error('Resume history error:', error);
      setSavedResumes([]);
    }
  };

  const fetchAppliedJobs = async (token) => {
    if (!token) {
      setAppliedJobs([]);
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/jobs/applied', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load applied jobs.');
      }

      setAppliedJobs(data.jobs || []);
    } catch (error) {
      console.error('Applied jobs error:', error);
      setAppliedJobs([]);
    }
  };

  useEffect(() => {
    const storedAuth = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedAuth) {
      return;
    }

    try {
      const parsedAuth = JSON.parse(storedAuth);
      if (!parsedAuth?.token) {
        return;
      }

      fetch('http://localhost:3000/api/auth/me', {
        headers: {
          Authorization: `Bearer ${parsedAuth.token}`,
        },
      })
        .then(async (response) => {
          const data = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(data.message || 'Session expired.');
          }
          setAuthState({
            token: parsedAuth.token,
            user: data.user,
          });
          fetchSavedResumes(parsedAuth.token);
          fetchAppliedJobs(parsedAuth.token);
        })
        .catch(() => {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthState(null);
          setSavedResumes([]);
          setAppliedJobs([]);
        });
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  const handleViewJobDetails = async (job) => {
    setSelectedJob({
      ...job,
      overview: job.description || 'No description available',
      fullDescription: job.description || 'No description available',
      aiSummary: null,
    });
    setJobDetailsError(null);

    if (job.source !== 'Indeed') {
      return;
    }

    setIsJobDetailsLoading(true);

    try {
      const response = await fetch('http://localhost:3000/api/jobs/details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(job),
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || `API error: ${response.status}`);
      }

      setSelectedJob(data);
    } catch (error) {
      console.error('Job details error:', error);
      setJobDetailsError(error.message);
    } finally {
      setIsJobDetailsLoading(false);
    }
  };

  const handleApply = async (job) => {
    setAuthError(null);

    const applyWindow = window.open(job.url, '_blank');
    if (!applyWindow || applyWindow.closed) {
      setAuthError('Your browser blocked the job posting tab. Please allow pop-ups and try again.');
      return;
    }

    try {
      applyWindow.opener = null;
    } catch {
      // Some browsers restrict cross-window access here; opening the tab is enough.
    }

    if (!authState?.token) {
      setApplyPromptJob({
        job,
        mode: 'login',
      });
      return;
    }

    setApplyPromptJob({
      job,
      mode: 'confirm',
    });
  };

  const saveAppliedJob = async (job) => {
    try {
      const response = await fetch('http://localhost:3000/api/jobs/applied', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify(job),
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save applied job.');
      }

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id ? { ...currentJob, isApplied: true } : currentJob
        )
      );
      await fetchAppliedJobs(authState.token);
    } catch (error) {
      console.error('Apply tracking error:', error);
      setAuthError(error.message || 'Failed to save applied job.');
    }
  };

  const handleApplyPromptConfirm = async () => {
    if (!applyPromptJob) {
      return;
    }

    if (applyPromptJob.mode === 'login') {
      setApplyPromptJob(null);
      setAuthModalMode('login');
      return;
    }

    const job = applyPromptJob.job;
    setApplyPromptJob(null);
    await saveAppliedJob(job);
  };

  const getResumeDrivenSearch = (resume) => {
    const analysis = resume?.analysis;
    if (!analysis) {
      return currentSearch;
    }

    const suggestedRole =
      analysis.suggested_search_keywords?.[0] ||
      analysis.target_roles?.[0] ||
      currentSearch.role ||
      DEFAULT_SEARCH.role;

    const suggestedLocation =
      analysis.preferred_locations?.find(Boolean) ||
      currentSearch.location ||
      DEFAULT_SEARCH.location;

    return {
      role: suggestedRole,
      location: suggestedLocation,
      jobType: currentSearch.jobType || DEFAULT_SEARCH.jobType,
    };
  };

  const handleAuthSuccess = ({ token, user }) => {
    const nextAuthState = { token, user };
    setAuthState(nextAuthState);
    setAuthError(null);
    setAuthModalMode(null);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuthState));
    fetchSavedResumes(token);
    fetchAppliedJobs(token);
  };

  const handleLogout = () => {
    const shouldLogout = window.confirm('Log out of your GradHunt account?');
    if (!shouldLogout) {
      return;
    }

    setAuthState(null);
    setAuthError(null);
    setSavedResumes([]);
    setAppliedJobs([]);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  return (
    <div className="app-container">
      <div className="header">
        <div className="container">
          <div className="header-bar">
            <div>
              <h1 className="display-4">GradHunt</h1>
              <p className="lead">Find tech internships and entry-level positions directly from company career sites</p>
            </div>
            <div className="auth-actions">
              {authState?.user ? (
                <>
                  <span className="auth-welcome">Signed in as {authState.user.name}</span>
                  <button type="button" className="btn btn-light" onClick={handleLogout}>Log out</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-light" onClick={() => setAuthModalMode('login')}>Log in</button>
                  <button type="button" className="btn btn-outline-light" onClick={() => setAuthModalMode('register')}>Sign up</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        {authError && <div className="alert alert-warning">{authError}</div>}
        <SearchForm
          onSearch={(role, location, jobType) => searchJobs(role, location, 1, null, jobType)}
          onUploadClick={() => setIsResumeModalOpen(true)}
          uploadedResumeName={uploadedResume?.originalName}
          initialRole={currentSearch.role}
          initialLocation={currentSearch.location}
          initialJobType={currentSearch.jobType}
        />

        {uploadedResume?.analysis && (
          <div className="resume-analysis-card">
            <div className="resume-analysis-header">
              <div>
                <h2>AI Resume Snapshot</h2>
                <p>{uploadedResume.analysis.candidate_summary}</p>
              </div>
              <div className="resume-analysis-level">{uploadedResume.analysis.experience_level}</div>
            </div>

            <div className="resume-analysis-grid">
              <div>
                <h3>Target Roles</h3>
                <div className="tag-list">
                  {uploadedResume.analysis.target_roles.map((item) => (
                    <span key={item} className="analysis-tag">{item}</span>
                  ))}
                </div>
              </div>

              <div>
                <h3>Skills</h3>
                <div className="tag-list">
                  {uploadedResume.analysis.skills.map((item) => (
                    <span key={item} className="analysis-tag">{item}</span>
                  ))}
                </div>
              </div>

              <div>
                <h3>Tools & Frameworks</h3>
                <div className="tag-list">
                  {uploadedResume.analysis.tools_and_frameworks.map((item) => (
                    <span key={item} className="analysis-tag">{item}</span>
                  ))}
                </div>
              </div>

              <div>
                <h3>Suggested Search Keywords</h3>
                <div className="tag-list">
                  {uploadedResume.analysis.suggested_search_keywords.map((item) => (
                    <span key={item} className="analysis-tag">{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="loading">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : error ? (
          <div>
            <h2>Error</h2>
            <div className="alert alert-danger">Failed to load jobs: {error}</div>
          </div>
        ) : (
          <>
            <div className="results-summary mb-4">
              <h2>Found {count} jobs from company career sites</h2>
              <p>Showing page {currentPage} of {totalPages}</p>
              {uploadedResume?.analysis && (
                <p className="match-mode-note">
                  Resume-driven search is active: using <strong>{currentSearch.role}</strong> in <strong>{currentSearch.location}</strong> for <strong>{currentSearch.jobType}</strong> roles.
                </p>
              )}
            </div>
            <div className="row">
              {jobs.length > 0 ? (
                jobs.map(job => (
                  <JobCard key={job.id} job={job} onViewDetails={handleViewJobDetails} onApply={handleApply} />
                ))
              ) : (
                <div className="col-12">
                  <div className="alert alert-info">
                    No jobs match your search criteria. Try different keywords or location.
                  </div>
                </div>
              )}
            </div>

            {/* Show pagination if we have more than one page */}
            {count > 0 && totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}

            {authState?.user && appliedJobs.length > 0 && (
              <div className="resume-analysis-card">
                <div className="resume-analysis-header">
                  <div>
                    <h2>Applied Job History</h2>
                    <p>Your recent jobs marked as applied.</p>
                  </div>
                  <div className="resume-analysis-level">{appliedJobs.length} saved</div>
                </div>
                <div className="applied-history-list">
                  {appliedJobs.slice(0, 6).map((job) => (
                    <a
                      key={job.id}
                      className="applied-history-item"
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <strong>{job.title}</strong>
                      <span>{job.company} · {job.location}</span>
                      <small>Applied {new Date(job.appliedAt).toLocaleDateString()}</small>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isResumeModalOpen && (
        <div className="resume-modal-backdrop" onClick={() => setIsResumeModalOpen(false)}>
          <div
            className="resume-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="resume-modal-header">
              <div>
                <h2>Upload Resume</h2>
                <p>Add your resume here without leaving the search page.</p>
              </div>
              <button
                type="button"
                className="resume-modal-close"
                onClick={() => setIsResumeModalOpen(false)}
                aria-label="Close resume upload"
              >
                ×
              </button>
            </div>

            <ResumeUpload
              authToken={authState?.token || null}
              savedResumes={savedResumes}
              onResumeHistoryUpdated={() => fetchSavedResumes(authState?.token)}
              onUploadSuccess={(resume) => {
                setUploadedResume(resume);
                setIsResumeModalOpen(false);
                const resumeSearch = getResumeDrivenSearch(resume);
                searchJobs(resumeSearch.role, resumeSearch.location, 1, resume.analysis, resumeSearch.jobType);
              }}
            />
          </div>
        </div>
      )}

      {applyPromptJob && (
        <div className="resume-modal-backdrop" onClick={() => setApplyPromptJob(null)}>
          <div
            className="resume-modal-card apply-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="resume-modal-header">
              <div>
                <h2>{applyPromptJob.mode === 'login' ? 'Track Applications' : 'Mark Job As Applied'}</h2>
                <p>
                  {applyPromptJob.mode === 'login'
                    ? 'You opened the job posting. Log in if you want GradHunt to save this job to your application history.'
                    : `Did you apply to ${applyPromptJob.job.title} at ${applyPromptJob.job.company}?`}
                </p>
              </div>
              <button
                type="button"
                className="resume-modal-close"
                onClick={() => setApplyPromptJob(null)}
                aria-label="Close apply prompt"
              >
                ×
              </button>
            </div>

            <div className="job-details-body">
              <div className="job-details-footer apply-modal-actions">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setApplyPromptJob(null)}
                >
                  {applyPromptJob.mode === 'login' ? 'Maybe later' : 'Not yet'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleApplyPromptConfirm}
                >
                  {applyPromptJob.mode === 'login' ? 'Log in' : 'Yes, save it'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedJob && (
        <div className="resume-modal-backdrop" onClick={() => setSelectedJob(null)}>
          <div
            className="job-details-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="resume-modal-header">
              <div>
                <h2>{selectedJob.title}</h2>
                <p>{selectedJob.company} · {selectedJob.location}</p>
              </div>
              <button
                type="button"
                className="resume-modal-close"
                onClick={() => setSelectedJob(null)}
                aria-label="Close job details"
              >
                ×
              </button>
            </div>

            <div className="job-details-body">
              {selectedJob.aiSummary && (
                <div className="job-details-summary">
                  <h3>AI Summary</h3>
                  <p>{selectedJob.aiSummary}</p>
                </div>
              )}

              {isJobDetailsLoading && (
                <div className="job-details-loading">Loading full job overview...</div>
              )}

              {jobDetailsError && (
                <div className="alert alert-warning">
                  {jobDetailsError}
                </div>
              )}

              <div className="job-details-section">
                <h3>Job Overview</h3>
                <p>{selectedJob.overview || selectedJob.aiSummary || selectedJob.description || 'No description available'}</p>
              </div>

              <details className="job-details-raw">
                <summary>Show full description</summary>
                <p>{selectedJob.fullDescription || selectedJob.description || 'No description available'}</p>
              </details>

              <div className="job-details-footer">
                <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  Open job posting
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          onClose={() => setAuthModalMode(null)}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}

export default App;
