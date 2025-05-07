// components/JobCard/JobCard.jsx
import './JobCard.css';

function JobCard({ job }) {
  // Format salary if available
  let salaryText = '';
  if (job.salary_min && job.salary_max) {
    const minSalary = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(job.salary_min);
    
    const maxSalary = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(job.salary_max);
    
    if (job.salary_min === job.salary_max) {
      salaryText = `${minSalary}${job.salary_is_predicted === "1" ? ' (estimated)' : ''}`;
    } else {
      salaryText = `${minSalary} - ${maxSalary}${job.salary_is_predicted === "1" ? ' (estimated)' : ''}`;
    }
  }
  
  // Format date for display
  const timePosted = job.time_posted || 'Recently';
  
  // Format applicants info if available
  const applicantsInfo = job.num_applicants || '';

  return (
    <div className="col-md-6 col-lg-4">
      <div className="card job-card h-100">
        <div className="card-body">
          <h5 className="card-title">{job.title}</h5>
          <div className="company mb-3">{job.company}</div>
          <div className="location mb-3">📍 {job.location}</div>
          
          {/* Source badge */}
          <div className="source mb-3">
            <span className="badge bg-primary">{job.source || 'Job Board'}</span>
          </div>
          
          {/* Time posted */}
          {timePosted && (
            <div className="time-posted mb-2">
              <small>Posted: {timePosted}</small>
            </div>
          )}
          
          {/* Applicant count if available */}
          {applicantsInfo && (
            <div className="applicants mb-2">
              <small>{applicantsInfo}</small>
            </div>
          )}
          
          {salaryText && <div className="salary mb-3">{salaryText}</div>}
          
          <p className="card-text job-description my-4">{job.description}</p>
          
          <div className="d-flex justify-content-between align-items-center mt-4">
            <small className="text-muted">Source: {job.source}</small>
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary">
              Apply
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobCard;