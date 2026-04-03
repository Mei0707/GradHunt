import { useState, useEffect } from "react";
import './App.css';
import JobCard from './components/JobCard/JobCard';
import SearchForm from './components/SearchForm/SearchForm';
import Pagination from "./components/Pagination/Pagination";
import ResumeUpload from './components/ResumeUpload/ResumeUpload';
import AuthModal from './components/AuthModal/AuthModal';

function App() {
  const DEFAULT_SEARCH = { role: 'software engineer', location: 'New York', jobType: 'full-time', hideApplied: false };
  const AUTH_STORAGE_KEY = 'gradhunt-auth';
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentSearch, setCurrentSearch] = useState(DEFAULT_SEARCH);
  const [searchedRoles, setSearchedRoles] = useState([DEFAULT_SEARCH.role]);
  const [uploadedResume, setUploadedResume] = useState(null);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [resumeIntentPrompt, setResumeIntentPrompt] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [isJobDetailsLoading, setIsJobDetailsLoading] = useState(false);
  const [jobDetailsError, setJobDetailsError] = useState(null);
  const [authState, setAuthState] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authModalMode, setAuthModalMode] = useState(null);
  const [authModalToken, setAuthModalToken] = useState('');
  const [authNotice, setAuthNotice] = useState({ type: null, message: '', link: '' });
  const [savedResumes, setSavedResumes] = useState([]);
  const [appliedJobs, setAppliedJobs] = useState([]);
  const [applyPromptJob, setApplyPromptJob] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState('overview');
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileStatus, setProfileStatus] = useState({ error: null, success: null });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordStatus, setPasswordStatus] = useState({ error: null, success: null });
  const [verificationStatus, setVerificationStatus] = useState({ error: null, success: null, link: '' });
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  const readJsonResponse = async (response) => {
    const rawText = await response.text();
    try {
      return rawText ? JSON.parse(rawText) : {};
    } catch (error) {
      throw new Error(`The backend returned an invalid response (${response.status}).`);
    }
  };

  const searchJobs = async (
    role,
    location,
    page = 1,
    resumeProfileOverride = null,
    jobType = currentSearch.jobType || DEFAULT_SEARCH.jobType,
    hideApplied = currentSearch.hideApplied ?? DEFAULT_SEARCH.hideApplied
  ) => {
    setIsLoading(true);
    setError(null);
    
    console.log(`Searching for ${role} in ${location}, page ${page}, type ${jobType}, hideApplied ${hideApplied}`);

    try {
      const payload = {
        role,
        location,
        page,
        jobType,
        hideApplied,
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
      setSearchedRoles(data.searchedRoles || [role]);

      // Save current search terms for pagination
      setCurrentSearch({ role, location, jobType, hideApplied });
    } catch (error) {
      console.error('Search error:', error);
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        setError('Could not reach the backend at http://localhost:3000. Please make sure the backend is running and then try again.');
      } else {
      setError(error.message);
      }
      setJobs([]);
      setSearchedRoles([role]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    
    // Scroll to top when changing pages
    window.scrollTo(0, 0);
    
    searchJobs(
      currentSearch.role,
      currentSearch.location,
      newPage,
      null,
      currentSearch.jobType,
      currentSearch.hideApplied
    );
  };

  useEffect(() => {
    // Initial search
    searchJobs(DEFAULT_SEARCH.role, DEFAULT_SEARCH.location, 1, null, DEFAULT_SEARCH.jobType, DEFAULT_SEARCH.hideApplied);
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
        if (response.status === 403) {
          setSavedResumes([]);
          return;
        }
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
        if (response.status === 403) {
          setAppliedJobs([]);
          return;
        }
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('authAction');
    const token = params.get('token');

    if (!action || !token) {
      return;
    }

    const clearAuthParams = () => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('authAction');
      nextUrl.searchParams.delete('token');
      window.history.replaceState({}, '', nextUrl.toString());
    };

    if (action === 'verify-email') {
      fetch('http://localhost:3000/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })
        .then(async (response) => {
          const data = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(data.message || 'Failed to verify email.');
          }

          setAuthNotice({ type: 'success', message: data.message, link: '' });
          if (data.user) {
            updateStoredAuthUser(data.user);
          }
          clearAuthParams();
        })
        .catch((verifyError) => {
          setAuthNotice({
            type: 'error',
            message: verifyError.message || 'Failed to verify email.',
            link: '',
          });
          clearAuthParams();
        });
      return;
    }

    if (action === 'reset-password') {
      setAuthModalToken(token);
      setAuthModalMode('reset-password');
      clearAuthParams();
    }
  }, []);

  useEffect(() => {
    if (!authState?.user) {
      setProfileForm({ name: '', email: '' });
      return;
    }

    setProfileForm({
      name: authState.user.name || '',
      email: authState.user.email || '',
    });
  }, [authState?.user]);

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

  const getResumeDrivenSearch = (resume, preferredJobType = currentSearch.jobType || DEFAULT_SEARCH.jobType) => {
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
      jobType: preferredJobType,
      hideApplied: currentSearch.hideApplied ?? DEFAULT_SEARCH.hideApplied,
    };
  };

  const handleResumeIntentChoice = (jobType) => {
    if (!resumeIntentPrompt?.resume) {
      return;
    }

    const resume = resumeIntentPrompt.resume;
    setResumeIntentPrompt(null);
    const resumeSearch = getResumeDrivenSearch(resume, jobType);
    searchJobs(
      resumeSearch.role,
      resumeSearch.location,
      1,
      resume.analysis,
      resumeSearch.jobType,
      resumeSearch.hideApplied
    );
  };

  const handleAuthSuccess = ({ token, user, verificationMessage, devPreviewLink, message }) => {
    const nextAuthState = { token, user };
    setAuthState(nextAuthState);
    setAuthError(null);
    setAuthModalMode(null);
    setAuthModalToken('');
    setAuthNotice({
      type: user?.isEmailVerified ? 'success' : 'info',
      message: verificationMessage || message || (user?.isEmailVerified
        ? 'Signed in successfully.'
        : 'Signed in. Your email is not verified yet.'),
      link: devPreviewLink || '',
    });
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuthState));
    fetchSavedResumes(token);
    fetchAppliedJobs(token);
  };

  const openProfile = () => {
    setProfileTab('overview');
    setProfileStatus({ error: null, success: null });
    setPasswordStatus({ error: null, success: null });
    setVerificationStatus({ error: null, success: null, link: '' });
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setIsProfileOpen(true);
  };

  const updateStoredAuthUser = (nextUser) => {
    setAuthState((currentAuth) => {
      if (!currentAuth) {
        return currentAuth;
      }

      const nextAuthState = {
        ...currentAuth,
        user: nextUser,
      };
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuthState));
      return nextAuthState;
    });
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();

    if (!authState?.token) {
      return;
    }

    setIsProfileSaving(true);
    setProfileStatus({ error: null, success: null });

    try {
      const response = await fetch('http://localhost:3000/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify(profileForm),
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update profile.');
      }

      updateStoredAuthUser(data.user);
      setProfileStatus({ error: null, success: data.message || 'Profile updated successfully.' });
      setVerificationStatus({
        error: null,
        success: data.devPreviewLink ? 'Verification link generated for your updated email.' : null,
        link: data.devPreviewLink || '',
      });
    } catch (error) {
      setProfileStatus({ error: error.message || 'Failed to update profile.', success: null });
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handlePasswordSave = async (event) => {
    event.preventDefault();

    if (!authState?.token) {
      return;
    }

    setIsPasswordSaving(true);
    setPasswordStatus({ error: null, success: null });

    try {
      const response = await fetch('http://localhost:3000/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authState.token}`,
        },
        body: JSON.stringify(passwordForm),
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to change password.');
      }

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setPasswordStatus({ error: null, success: data.message || 'Password updated successfully.' });
    } catch (error) {
      setPasswordStatus({ error: error.message || 'Failed to change password.', success: null });
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleRequestVerification = async () => {
    if (!authState?.token) {
      return;
    }

    setVerificationStatus({ error: null, success: null, link: '' });

    try {
      const response = await fetch('http://localhost:3000/api/auth/request-verification', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authState.token}`,
        },
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send verification email.');
      }

      setVerificationStatus({
        error: null,
        success: data.message || 'Verification email sent.',
        link: data.devPreviewLink || '',
      });
    } catch (error) {
      setVerificationStatus({
        error: error.message || 'Failed to send verification email.',
        success: null,
        link: '',
      });
    }
  };

  const dismissAuthNotice = () => {
    setAuthNotice({ type: null, message: '', link: '' });
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
    setIsProfileOpen(false);
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
                  <button type="button" className="btn btn-outline-light" onClick={openProfile}>
                    Profile
                  </button>
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
        {authNotice.message && (
          <div className={`auth-notice-card auth-notice-${authNotice.type || 'info'}`}>
            <div className="auth-notice-copy">
              <strong>
                {authNotice.type === 'success'
                  ? 'Account update complete'
                  : authNotice.type === 'error'
                    ? 'Action needed'
                    : 'Account notice'}
              </strong>
              <p>{authNotice.message}</p>
              <div className="auth-notice-actions">
                {authNotice.link && (
                  <a href={authNotice.link} className="btn btn-sm btn-outline-secondary">
                    Open local preview link
                  </a>
                )}
                {!authState?.user && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setAuthModalMode('login')}
                  >
                    Log in
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              className="auth-notice-dismiss"
              onClick={dismissAuthNotice}
              aria-label="Dismiss auth notice"
            >
              ×
            </button>
          </div>
        )}
        <SearchForm
          onSearch={(role, location, jobType, hideApplied) => searchJobs(role, location, 1, null, jobType, hideApplied)}
          onUploadClick={() => setIsResumeModalOpen(true)}
          uploadedResumeName={uploadedResume?.originalName}
          initialRole={currentSearch.role}
          initialLocation={currentSearch.location}
          initialJobType={currentSearch.jobType}
          initialHideApplied={currentSearch.hideApplied}
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
                  Resume-driven search is active: using <strong>{searchedRoles.join(', ')}</strong> in <strong>{currentSearch.location}</strong> for <strong>{currentSearch.jobType}</strong> roles{currentSearch.hideApplied ? ', hiding applied jobs' : ''}.
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
          </>
        )}
      </div>

      {isProfileOpen && authState?.user && (
        <div className="resume-modal-backdrop" onClick={() => setIsProfileOpen(false)}>
          <div
            className="job-details-modal-card profile-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="resume-modal-header">
              <div>
                <h2>{authState.user.name}'s Profile</h2>
                <p>Review your saved resumes and applied job history.</p>
              </div>
              <button
                type="button"
                className="resume-modal-close"
                onClick={() => setIsProfileOpen(false)}
                aria-label="Close profile"
              >
                ×
              </button>
            </div>

            <div className="job-details-body">
              <div className="profile-tab-bar">
                <button
                  type="button"
                  className={`profile-tab ${profileTab === 'overview' ? 'profile-tab-active' : ''}`}
                  onClick={() => setProfileTab('overview')}
                >
                  Overview
                </button>
                <button
                  type="button"
                  className={`profile-tab ${profileTab === 'settings' ? 'profile-tab-active' : ''}`}
                  onClick={() => setProfileTab('settings')}
                >
                  Settings
                </button>
              </div>

              {profileTab === 'overview' ? (
                authState.user.isEmailVerified ? (
                  <>
                    <div className="profile-summary-grid">
                      <div className="profile-stat-card">
                        <strong>{savedResumes.length}</strong>
                        <span>Saved resumes</span>
                      </div>
                      <div className="profile-stat-card">
                        <strong>{appliedJobs.length}</strong>
                        <span>Applied jobs</span>
                      </div>
                      <div className="profile-stat-card profile-stat-card-wide">
                        <strong>{authState.user.email}</strong>
                        <span>Account email</span>
                      </div>
                      <div className="profile-stat-card">
                        <strong>Verified</strong>
                        <span>Email verification</span>
                      </div>
                      <div className="profile-stat-card">
                        <strong>{new Date(authState.user.createdAt).toLocaleDateString()}</strong>
                        <span>Member since</span>
                      </div>
                    </div>

                    <div className="profile-section">
                      <div className="resume-analysis-header">
                        <div>
                          <h2>Applied Job History</h2>
                          <p>Jobs you have marked as applied.</p>
                        </div>
                        <div className="resume-analysis-level">{appliedJobs.length} saved</div>
                      </div>
                      {appliedJobs.length > 0 ? (
                        <div className="applied-history-list">
                          {appliedJobs.map((job) => (
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
                      ) : (
                        <div className="alert alert-info profile-empty-state">
                          No applied jobs yet. When you click Apply and confirm it, it will show up here.
                        </div>
                      )}
                    </div>

                    <div className="profile-section">
                      <div className="resume-analysis-header">
                        <div>
                          <h2>Saved Resumes</h2>
                          <p>Your previously uploaded resumes.</p>
                        </div>
                        <div className="resume-analysis-level">{savedResumes.length} saved</div>
                      </div>
                      {savedResumes.length > 0 ? (
                        <div className="applied-history-list">
                          {savedResumes.map((resume) => (
                            <div key={resume.id} className="applied-history-item">
                              <strong>{resume.originalName}</strong>
                              <span>{resume.analysis?.experience_level || 'Resume analysis available'}</span>
                              <small>Uploaded {new Date(resume.createdAt).toLocaleDateString()}</small>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="alert alert-info profile-empty-state">
                          No saved resumes yet. Upload one from the search form to store it in your profile.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="profile-lock-hero">
                      <div className="profile-lock-copy">
                        <span className="profile-lock-pill">Verification pending</span>
                        <h3>Verify your email to unlock your GradHunt profile</h3>
                        <p>
                          Saved resumes and applied-job history stay locked until your email is verified. Once you verify, we will start syncing your profile activity here.
                        </p>
                      </div>
                      <div className="profile-lock-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setProfileTab('settings')}
                        >
                          Go to settings
                        </button>
                      </div>
                    </div>

                    <div className="profile-summary-grid profile-summary-grid-compact">
                      <div className="profile-stat-card profile-stat-card-wide">
                        <strong>{authState.user.email}</strong>
                        <span>Account email</span>
                      </div>
                      <div className="profile-stat-card">
                        <strong>Pending</strong>
                        <span>Email verification</span>
                      </div>
                      <div className="profile-stat-card">
                        <strong>{new Date(authState.user.createdAt).toLocaleDateString()}</strong>
                        <span>Member since</span>
                      </div>
                    </div>

                    <div className="profile-lock-grid">
                      <div className="profile-lock-card">
                        <div className="profile-lock-card-header">
                          <h2>Applied Job History</h2>
                          <span className="profile-lock-tag">Locked</span>
                        </div>
                        <p>Track jobs you applied to and keep them marked across future searches.</p>
                      </div>

                      <div className="profile-lock-card">
                        <div className="profile-lock-card-header">
                          <h2>Saved Resumes</h2>
                          <span className="profile-lock-tag">Locked</span>
                        </div>
                        <p>Reuse your uploaded resumes without starting from scratch next time you visit.</p>
                      </div>
                    </div>
                  </>
                )
              ) : (
                <div className="profile-settings-grid">
                  <div className="profile-settings-card">
                    <div className="resume-analysis-header">
                      <div>
                        <h2>Account Details</h2>
                        <p>Update your public account information.</p>
                      </div>
                    </div>
                    {profileStatus.error && <div className="alert alert-danger">{profileStatus.error}</div>}
                    {profileStatus.success && <div className="alert alert-success">{profileStatus.success}</div>}
                    <form className="profile-form" onSubmit={handleProfileSave}>
                      <label className="profile-label">
                        <span>Name</span>
                        <input
                          type="text"
                          className="form-control"
                          value={profileForm.name}
                          onChange={(event) =>
                            setProfileForm((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                      </label>
                      <label className="profile-label">
                        <span>Email</span>
                        <input
                          type="email"
                          className="form-control"
                          value={profileForm.email}
                          onChange={(event) =>
                            setProfileForm((current) => ({ ...current, email: event.target.value }))
                          }
                        />
                      </label>
                      <div className="profile-form-actions">
                        <button type="submit" className="btn btn-primary" disabled={isProfileSaving}>
                          {isProfileSaving ? 'Saving...' : 'Save changes'}
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="profile-settings-card">
                    <div className="resume-analysis-header">
                      <div>
                        <h2>Email Verification</h2>
                        <p>Verify your email so your account recovery flow stays secure.</p>
                      </div>
                    </div>
                    <div className="profile-verification-row">
                      <span className={`profile-verification-badge ${authState.user.isEmailVerified ? 'profile-verified' : 'profile-unverified'}`}>
                        {authState.user.isEmailVerified ? 'Verified' : 'Not verified'}
                      </span>
                    </div>
                    {verificationStatus.error && <div className="alert alert-danger">{verificationStatus.error}</div>}
                    {verificationStatus.success && <div className="alert alert-success">{verificationStatus.success}</div>}
                    {verificationStatus.link && (
                      <div className="alert alert-secondary auth-dev-link">
                        <span>Local preview link:</span>
                        <a href={verificationStatus.link}>{verificationStatus.link}</a>
                      </div>
                    )}
                    {!authState.user.isEmailVerified && (
                      <div className="profile-form-actions">
                        <button type="button" className="btn btn-primary" onClick={handleRequestVerification}>
                          Send verification email
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="profile-settings-card">
                    <div className="resume-analysis-header">
                      <div>
                        <h2>Change Password</h2>
                        <p>Keep your account secure with a new password.</p>
                      </div>
                    </div>
                    {passwordStatus.error && <div className="alert alert-danger">{passwordStatus.error}</div>}
                    {passwordStatus.success && <div className="alert alert-success">{passwordStatus.success}</div>}
                    <form className="profile-form" onSubmit={handlePasswordSave}>
                      <label className="profile-label">
                        <span>Current password</span>
                        <input
                          type="password"
                          className="form-control"
                          value={passwordForm.currentPassword}
                          onChange={(event) =>
                            setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                          }
                        />
                      </label>
                      <label className="profile-label">
                        <span>New password</span>
                        <input
                          type="password"
                          className="form-control"
                          value={passwordForm.newPassword}
                          onChange={(event) =>
                            setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                          }
                        />
                      </label>
                      <label className="profile-label">
                        <span>Confirm new password</span>
                        <input
                          type="password"
                          className="form-control"
                          value={passwordForm.confirmPassword}
                          onChange={(event) =>
                            setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                          }
                        />
                      </label>
                      <div className="profile-form-actions">
                        <button type="submit" className="btn btn-primary" disabled={isPasswordSaving}>
                          {isPasswordSaving ? 'Updating...' : 'Update password'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                setResumeIntentPrompt({ resume });
              }}
            />
          </div>
        </div>
      )}

      {resumeIntentPrompt && (
        <div className="resume-modal-backdrop" onClick={() => setResumeIntentPrompt(null)}>
          <div
            className="resume-modal-card apply-modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="resume-modal-header">
              <div>
                <h2>What are you looking for right now?</h2>
                <p>
                  Your resume can fit multiple paths. Choose the search direction you want GradHunt to focus on for this search.
                </p>
              </div>
              <button
                type="button"
                className="resume-modal-close"
                onClick={() => setResumeIntentPrompt(null)}
                aria-label="Close resume intent prompt"
              >
                ×
              </button>
            </div>

            <div className="job-details-body">
              <div className="resume-intent-grid">
                <button
                  type="button"
                  className="resume-intent-card"
                  onClick={() => handleResumeIntentChoice('intern')}
                >
                  <strong>Internships</strong>
                  <span>Focus on internship and co-op opportunities.</span>
                </button>
                <button
                  type="button"
                  className="resume-intent-card"
                  onClick={() => handleResumeIntentChoice('full-time')}
                >
                  <strong>New Grad / Full-time</strong>
                  <span>Focus on entry-level and full-time roles.</span>
                </button>
              </div>
            </div>
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
          actionToken={authModalToken}
          onClose={() => {
            setAuthModalMode(null);
            setAuthModalToken('');
          }}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}

export default App;
