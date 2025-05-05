// components/SearchForm/SearchForm.jsx
import { useState } from 'react';
import './SearchForm.css';

function SearchForm({ onSearch }) {
  const [role, setRole] = useState('software intern');
  const [location, setLocation] = useState('New York');

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted with:', { role, location });
    onSearch(role, location);
  };

  return (
    <div className="search-box">
      <form onSubmit={handleSubmit} className="row g-3">
        <div className="col-md-5">
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
        <div className="col-md-5">
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
        <div className="col-md-2 d-flex align-items-end">
          <button type="submit" className="btn btn-primary w-100">Search</button>
        </div>
      </form>
    </div>
  );
}

export default SearchForm;