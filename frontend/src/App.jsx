import { useState, useEffect } from "react";
import './App.css';
import JobCard from './components/JobCard/JobCard';
import SearchForm from './components/SearchForm/SearchForm';
import Pagination from "./components/Pagination/Pagination";
import ResumeUpload from './components/ResumeUpload/ResumeUpload';

function App() {
  const DEFAULT_SEARCH = { role: 'software intern', location: 'New York' };
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentSearch, setCurrentSearch] = useState(DEFAULT_SEARCH);
  const [uploadedResume, setUploadedResume] = useState(null);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);

  const searchJobs = async (role, location, page = 1, resumeProfileOverride = null) => {
    setIsLoading(true);
    setError(null);
    
    console.log(`Searching for ${role} in ${location}, page ${page}`);

    try {
      const payload = {
        role,
        location,
        page,
        resumeProfile: resumeProfileOverride || uploadedResume?.analysis || null,
      };
      console.log('Search payload:', payload);
      
      const response = await fetch('http://localhost:3000/api/jobs/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      setCurrentSearch({ role, location });
    } catch (error) {
      console.error('Search error:', error);
      setError(error.message);
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    
    // Scroll to top when changing pages
    window.scrollTo(0, 0);
    
    searchJobs(currentSearch.role, currentSearch.location, newPage);
  };

  useEffect(() => {
    // Initial search
    searchJobs(DEFAULT_SEARCH.role, DEFAULT_SEARCH.location);
  }, []);

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
    };
  };

  return (
    <div className="app-container">
      <div className="header">
        <div className="container">
          <h1 className="display-4">GradHunt</h1>
          <p className="lead">Find tech internships and entry-level positions directly from company career sites</p>
        </div>
      </div>

      <div className="container">
        <SearchForm
          onSearch={(role, location) => searchJobs(role, location, 1)}
          onUploadClick={() => setIsResumeModalOpen(true)}
          uploadedResumeName={uploadedResume?.originalName}
          initialRole={currentSearch.role}
          initialLocation={currentSearch.location}
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
                  Resume-driven search is active: using <strong>{currentSearch.role}</strong> in <strong>{currentSearch.location}</strong>.
                </p>
              )}
            </div>
            <div className="row">
              {jobs.length > 0 ? (
                jobs.map(job => (
                  <JobCard key={job.id} job={job} />
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
              onUploadSuccess={(resume) => {
                setUploadedResume(resume);
                setIsResumeModalOpen(false);
                const resumeSearch = getResumeDrivenSearch(resume);
                searchJobs(resumeSearch.role, resumeSearch.location, 1, resume.analysis);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
