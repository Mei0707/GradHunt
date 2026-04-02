// components/SearchForm/SearchForm.jsx
import { useEffect, useState } from 'react';
import './SearchForm.css';

function SearchForm({
  onSearch,
  onUploadClick,
  uploadedResumeName,
  initialRole = 'software engineer',
  initialLocation = 'New York',
  initialJobType = 'full-time',
}) {
  const [role, setRole] = useState(initialRole);
  const [location, setLocation] = useState(initialLocation);
  const [jobType, setJobType] = useState(initialJobType);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  useEffect(() => {
    setLocation(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    setJobType(initialJobType);
  }, [initialJobType]);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted with:', { role, location, jobType });
    onSearch(role, location, jobType);
  };

  return (
    <div className="search-box">
      <form onSubmit={handleSubmit} className="row g-3">
        <div className="col-md-4">
          <label htmlFor="role" className="form-label">Job Role</label>
          <input
            type="text"
            className="form-control"
            id="role"
            placeholder="e.g., Software Engineer Intern"
            value={role}
            onChange={(e) => {
              console.log('Role changed:', e.target.value);
              setRole(e.target.value);
            }}
          />
        </div>
        <div className="col-md-4">
          <label htmlFor="location" className="form-label">Location</label>
          <input
            type="text"
            className="form-control"
            id="location"
            placeholder="e.g., New York"
            value={location}
            onChange={(e) => {
              console.log('Location changed:', e.target.value);
              setLocation(e.target.value);
            }}
          />
        </div>
        <div className="col-md-2">
          <label htmlFor="jobType" className="form-label">Job Type</label>
          <select
            id="jobType"
            className="form-select"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
          >
            <option value="full-time">Full-time</option>
            <option value="intern">Intern</option>
          </select>
        </div>
        <div className="col-md-2 d-flex align-items-end">
          <div className="search-actions">
            <button type="submit" className="btn btn-primary action-button">Search</button>
            <button
              type="button"
              className="btn btn-outline-primary action-button upload-inline-button"
              onClick={onUploadClick}
            >
              {uploadedResumeName ? 'Update Resume' : 'Upload Resume'}
            </button>
          </div>
        </div>
      </form>

      {uploadedResumeName && (
        <div className="uploaded-resume-inline">
          Resume ready: <strong>{uploadedResumeName}</strong>
        </div>
      )}
    </div>
  );
}

export default SearchForm;
