import { useState, useEffect } from "react";
import './App.css';
import JobCard from './components/JobCard/JobCard';
import SearchForm from './components/SearchForm/SearchForm';
import Pagination from "./components/Pagination/Pagination";

function App() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [currentSearch, setCurrentSearch] = useState({ role: 'software intern', location: 'New York' });

  const searchJobs = async (role, location, page = 1) => {
    setIsLoading(true);
    setError(null);
    
    console.log(`Searching for ${role} in ${location}, page ${page}`);

    try {
      // Use the updated endpoint for scraped jobs only
      const url = `http://localhost:3000/api/jobs/search?role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&page=${page}`;
      console.log('Request URL:', url);
      
      const response = await fetch(url);

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
    searchJobs('software intern', 'New York');
  }, []);

  return (
    <div className="app-container">
      <div className="header">
        <div className="container">
          <h1 className="display-4">GradHunt</h1>
          <p className="lead">Find tech internships and entry-level positions directly from company career sites</p>
        </div>
      </div>

      <div className="container">
        <SearchForm onSearch={(role, location) => searchJobs(role, location, 1)} />

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
    </div>
  );
}

export default App;