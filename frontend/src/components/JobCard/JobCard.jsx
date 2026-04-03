// components/JobCard/JobCard.jsx
import './JobCard.css';

function JobCard({ job, onViewDetails, onApply, onGenerateCoverLetter, canGenerateCoverLetter = false }) {
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
  const matchScore = typeof job.matchScore === 'number' ? job.matchScore : null;
  const matchReasons = Array.isArray(job.matchReasons) ? job.matchReasons : [];
  const isApplied = Boolean(job.isApplied);

  return (
    <div className="col-md-6 col-lg-4">
      <div className="card job-card h-100">
        <div className="card-body">
          <div className="job-card-content">
            {matchScore !== null && (
              <div className="match-score-row mb-3">
                <span className="match-score-badge">{matchScore}% match</span>
              </div>
            )}
            <div className="job-card-header-block">
              <h5 className="card-title">{job.title}</h5>
              <div className="company">{job.company}</div>
              <div className="location">📍 {job.location}</div>
            </div>

            <div className="source">
              <span className="badge bg-primary">{job.source || 'Job Board'}</span>
              {isApplied && <span className="badge applied-badge ms-2">Already applied</span>}
            </div>

            <div className="job-card-meta">
              {timePosted && (
                <div className="time-posted">
                  <small>Posted: {timePosted}</small>
                </div>
              )}

              {applicantsInfo && (
                <div className="applicants">
                  <small>{applicantsInfo}</small>
                </div>
              )}

              {salaryText && <div className="salary">{salaryText}</div>}
            </div>

            <p className="card-text job-description">{job.description}</p>

            <div className="match-reasons">
              {matchReasons.slice(0, 3).map((reason) => (
                <div key={reason} className="match-reason-item">{reason}</div>
              ))}
            </div>
          </div>

          <div className="job-card-actions">
            <small className="text-muted">Source: {job.source}</small>
            <div className="job-card-button-row">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onViewDetails(job)}
              >
                Details
              </button>
              {canGenerateCoverLetter && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={() => onGenerateCoverLetter(job)}
                >
                  Cover Letter
                </button>
              )}
              <button
                type="button"
                className={`btn btn-sm ${isApplied ? 'btn-success' : 'btn-outline-primary'}`}
                onClick={() => onApply(job)}
              >
                {isApplied ? 'Applied' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobCard;
