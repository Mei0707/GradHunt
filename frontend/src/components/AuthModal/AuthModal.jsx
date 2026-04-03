import { useEffect, useState } from 'react';
import './AuthModal.css';

const readJsonResponse = async (response) => {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    throw new Error(`The backend returned an invalid response (${response.status}).`);
  }
};

function AuthModal({ mode = 'login', actionToken = '', onClose, onAuthSuccess }) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [devLink, setDevLink] = useState('');

  const isRegister = currentMode === 'register';
  const isForgotPassword = currentMode === 'forgot-password';
  const isResetPassword = currentMode === 'reset-password';

  useEffect(() => {
    setCurrentMode(mode);
    setError('');
    setSuccess('');
    setDevLink('');
  }, [mode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setDevLink('');
    setIsSubmitting(true);

    try {
      const endpoint = isRegister
        ? 'register'
        : isForgotPassword
          ? 'forgot-password'
          : isResetPassword
            ? 'reset-password'
            : 'login';
      const response = await fetch(`http://localhost:3000/api/auth/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isRegister
            ? { name, email, password }
            : isForgotPassword
              ? { email }
              : isResetPassword
                ? { token: actionToken, newPassword: password, confirmPassword }
                : { email, password }
        ),
      });

      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || data.error || `API error: ${response.status}`);
      }

      if (isRegister || (!isForgotPassword && !isResetPassword)) {
        onAuthSuccess(data);
        return;
      }

      setSuccess(data.message || (isForgotPassword ? 'Password reset email sent.' : 'Password reset successfully.'));
      if (data.devPreviewLink) {
        setDevLink(data.devPreviewLink);
      }
      if (isResetPassword) {
        setCurrentMode('login');
      }
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
            <h2>
              {isRegister
                ? 'Create Account'
                : isForgotPassword
                  ? 'Forgot Password'
                  : isResetPassword
                    ? 'Reset Password'
                    : 'Log In'}
            </h2>
            <p>
              {isRegister
                ? 'Save your resumes and application history.'
                : isForgotPassword
                  ? 'Enter your email and we will send a reset link.'
                  : isResetPassword
                    ? 'Choose a new password for your account.'
                    : 'Sign in to access your profile features later.'}
            </p>
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

          {!isResetPassword && (
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
          )}

          {!isForgotPassword && (
            <div className="mb-3">
              <label htmlFor="authPassword" className="form-label">
                {isResetPassword ? 'New Password' : 'Password'}
              </label>
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
          )}

          {isResetPassword && (
            <div className="mb-3">
              <label htmlFor="authConfirmPassword" className="form-label">Confirm New Password</label>
              <input
                id="authConfirmPassword"
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
          )}

          {error && <div className="alert alert-danger mb-3">{error}</div>}
          {success && <div className="alert alert-success mb-3">{success}</div>}
          {devLink && (
            <div className="alert alert-secondary mb-3 auth-dev-link">
              <span>Local preview link:</span>
              <a href={devLink}>{devLink}</a>
            </div>
          )}

          <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
            {isSubmitting
              ? 'Please wait...'
              : isRegister
                ? 'Create account'
                : isForgotPassword
                  ? 'Send reset link'
                  : isResetPassword
                    ? 'Reset password'
                    : 'Log in'}
          </button>

          {!isForgotPassword && !isResetPassword && (
            <>
              <button
                type="button"
                className="auth-switch-button"
                onClick={() => {
                  setCurrentMode(isRegister ? 'login' : 'register');
                  setError('');
                  setSuccess('');
                }}
              >
                {isRegister ? 'Already have an account? Log in' : 'Need an account? Create one'}
              </button>

              {!isRegister && (
                <button
                  type="button"
                  className="auth-switch-button"
                  onClick={() => {
                    setCurrentMode('forgot-password');
                    setError('');
                    setSuccess('');
                  }}
                >
                  Forgot password?
                </button>
              )}
            </>
          )}

          {(isForgotPassword || isResetPassword) && (
            <button
              type="button"
              className="auth-switch-button"
              onClick={() => {
                setCurrentMode('login');
                setError('');
                setSuccess('');
                setDevLink('');
              }}
            >
              Back to log in
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default AuthModal;
