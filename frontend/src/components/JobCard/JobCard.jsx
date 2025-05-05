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
  
  // Format date
  const jobDate = new Date(job.created);
  const dateText = jobDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="col-md-6 col-lg-4">
      <div className="card job-card h-100">
        <div className="card-body">
          <h5 className="card-title">{job.title}</h5>
          <div className="company mb-2">{job.company}</div>
          <div className="location mb-2">📍 {job.location}</div>
          {salaryText && <div className="salary">{salaryText}</div>}
          <p className="card-text job-description mt-3">{job.description}</p>
          <div className="d-flex justify-content-between align-items-center mt-3">
            <small className="text-muted">Posted: {dateText}</small>
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