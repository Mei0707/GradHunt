import { useState } from 'react';
import './AuthModal.css';

const readJsonResponse = async (response) => {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    throw new Error(`The backend returned an invalid response (${response.status}).`);
  }
};

function AuthModal({ mode = 'login', onClose, onAuthSuccess }) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isRegister = currentMode === 'register';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`http://localhost:3000/api/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isRegister
            ? { name, email, password }
            : { email, password }
        ),
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || `API error: ${response.status}`);
      }

      onAuthSuccess(data);
    } catch (submitError) {
      setError(submitError.message || 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="resume-modal-backdrop" onClick={onClose}>
      <div className="auth-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="resume-modal-header">
          <div>
            <h2>{isRegister ? 'Create Account' : 'Log In'}</h2>
            <p>{isRegister ? 'Save your resumes and application history.' : 'Sign in to access your profile features later.'}</p>
          </div>
          <button
            type="button"
            className="resume-modal-close"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            ×
          </button>
        </div>

        <form className="auth-modal-form" onSubmit={handleSubmit}>
          {isRegister && (
            <div className="mb-3">
              <label htmlFor="authName" className="form-label">Name</label>
              <input
                id="authName"
                className="form-control"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="authEmail" className="form-label">Email</label>
            <input
              id="authEmail"
              type="email"
              className="form-control"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="authPassword" className="form-label">Password</label>
            <input
              id="authPassword"
              type="password"
              className="form-control"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>

          {error && <div className="alert alert-danger mb-3">{error}</div>}

          <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : isRegister ? 'Create account' : 'Log in'}
          </button>

          <button
            type="button"
            className="auth-switch-button"
            onClick={() => {
              setCurrentMode(isRegister ? 'login' : 'register');
              setError('');
            }}
          >
            {isRegister ? 'Already have an account? Log in' : 'Need an account? Create one'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
