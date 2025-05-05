import { useState, useEffect } from "react";
import './App.css';
import JobCard from './components/JobCard/JobCard';
import SearchForm from './components/SearchForm/SearchForm';

function App() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [count, setCount] = useState(0);

  const searchJobs = async (role, location) => {
    console.log('App received search request:', { role, location });
    setIsLoading(true);
    setError(null);
    
    try {
      const url = `http://localhost:3000/api/jobs/search?role=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`;
      console.log('Making API request to:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Received API response with', data.jobs?.length, 'jobs');
      setJobs(data.jobs || []);
      setCount(data.count || 0);
    } catch (error) {
      console.error('Error in search:', error);
      setError(error.message);
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    //initial search
    searchJobs('software intern', 'New York');
  }, []);

  return (
    <div className="app-container">
      <div className="header">
        <div className="container">
          <h1 className="display-4">GradHunt</h1>
          <p className="lead">Find your perfect tech internship or entry-level position</p>
        </div>
      </div>

      <div className="container">
        <SearchForm onSearch={searchJobs} />

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
              <h2>Found {count} jobs</h2>
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
          </>
        )}
      </div>
    </div>

  );
}

export default App;