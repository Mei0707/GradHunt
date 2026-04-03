import { useState } from 'react';
import './ResumeUpload.css';

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64Content = typeof result === 'string' ? result.split(',')[1] : '';
      resolve(base64Content);
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

const readJsonResponse = async (response) => {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
    throw new Error(
      isHtml
        ? 'The backend returned an HTML error page. Please restart the backend and try again.'
        : 'The backend returned an invalid response. Please try again.'
    );
  }
};

function ResumeUpload({ onUploadSuccess, authToken = null, savedResumes = [], onResumeHistoryUpdated = null }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setError('');
    setSuccessMessage('');
  };

  const handleUpload = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      if (!resumeText.trim()) {
        setError('Please choose a resume file or paste your resume text before uploading.');
        return;
      }
    }

    if (!selectedFile && resumeText.trim()) {
      setIsAnalyzing(true);
      setError('');
      setSuccessMessage('');

      try {
        const analysisResponse = await fetch('http://localhost:3000/api/resume/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resumeText,
          }),
        });

        const analysisData = await readJsonResponse(analysisResponse);
        if (!analysisResponse.ok) {
          throw new Error(analysisData.message || 'Resume analysis failed.');
        }

        setSuccessMessage('Resume text analyzed successfully.');
        const savedResumePayload = {
          originalName: 'Pasted resume text',
          storedFileName: null,
          mimeType: 'text/plain',
          size: resumeText.length,
          uploadedAt: new Date().toISOString(),
          analysis: analysisData.analysis,
          extractedTextPreview: analysisData.extractedTextPreview,
        };

        if (authToken) {
          const saveResponse = await fetch('http://localhost:3000/api/resume/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify(savedResumePayload),
          });
          const saveData = await readJsonResponse(saveResponse);
          if (saveResponse.ok) {
            onResumeHistoryUpdated?.();
          } else if (saveData.message) {
            setSuccessMessage(`Resume analyzed successfully. ${saveData.message}`);
          }
        }

        if (onUploadSuccess) {
          onUploadSuccess(savedResumePayload);
        }
      } catch (uploadError) {
        console.error('Resume analysis failed:', uploadError);
        setError(uploadError.message || 'Failed to analyze resume text.');
      } finally {
        setIsAnalyzing(false);
      }
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessMessage('');

    try {
      const fileData = await readFileAsBase64(selectedFile);
      const response = await fetch('http://localhost:3000/api/resume/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileData,
        }),
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.message || 'Upload failed.');
      }

      setSuccessMessage(`${data.resume.originalName} uploaded successfully. Running AI analysis...`);
      setIsAnalyzing(true);

      const analysisResponse = await fetch('http://localhost:3000/api/resume/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storedFileName: data.resume.storedFileName,
        }),
      });

      const analysisData = await readJsonResponse(analysisResponse);
      if (!analysisResponse.ok) {
        throw new Error(analysisData.message || 'Resume analysis failed.');
      }

      setSuccessMessage(`${data.resume.originalName} uploaded and analyzed successfully.`);
      const completedResume = {
        ...data.resume,
        analysis: analysisData.analysis,
        extractedTextPreview: analysisData.extractedTextPreview,
      };

      if (authToken) {
        const saveResponse = await fetch('http://localhost:3000/api/resume/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(completedResume),
        });
        const saveData = await readJsonResponse(saveResponse);
        if (saveResponse.ok) {
          onResumeHistoryUpdated?.();
        } else if (saveData.message) {
          setSuccessMessage(`${data.resume.originalName} uploaded and analyzed successfully. ${saveData.message}`);
        }
      }

      if (onUploadSuccess) {
        onUploadSuccess(completedResume);
      }
    } catch (uploadError) {
      console.error('Resume upload failed:', uploadError);
      setError(uploadError.message || 'Failed to upload resume.');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="resume-upload-box">
      <div className="resume-upload-header">
        <h2>Upload Your Resume</h2>
        <p>Add your resume first, then we can build AI matching on top of it.</p>
      </div>

      {savedResumes.length > 0 && (
        <div className="saved-resume-list">
          <div className="saved-resume-list-header">Previous resumes</div>
          <div className="saved-resume-items">
            {savedResumes.map((resume) => (
              <button
                type="button"
                key={resume.id || `${resume.originalName}-${resume.uploadedAt}`}
                className="saved-resume-item"
                onClick={() => {
                  setError('');
                  setSuccessMessage(`Using saved resume: ${resume.originalName}`);
                  onUploadSuccess?.(resume);
                }}
              >
                <span className="saved-resume-name">{resume.originalName}</span>
                <span className="saved-resume-meta">
                  {new Date(resume.uploadedAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleUpload} className="row g-3">
        <div className="col-md-8">
          <label htmlFor="resumeFile" className="form-label">Resume File</label>
          <input
            id="resumeFile"
            type="file"
            className="form-control"
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
          />
          <small className="text-muted">Accepted formats: PDF, DOC, DOCX, TXT. Max size: 5 MB.</small>
        </div>

        <div className="col-md-4 d-flex align-items-end">
          <button type="submit" className="btn btn-primary w-100" disabled={isUploading || isAnalyzing}>
            {isUploading ? 'Uploading...' : isAnalyzing ? 'Analyzing...' : 'Upload Resume'}
          </button>
        </div>

        <div className="col-12">
          <label htmlFor="resumeText" className="form-label">Or Paste Resume Text</label>
          <textarea
            id="resumeText"
            className="form-control"
            rows="8"
            placeholder="Paste your resume text here if the PDF is not machine-readable."
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
          />
        </div>
      </form>

      {selectedFile && (
        <div className="resume-file-meta">
          <strong>Selected:</strong> {selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)
        </div>
      )}

      {successMessage && <div className="alert alert-success mt-3 mb-0">{successMessage}</div>}
      {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
    </div>
  );
}

export default ResumeUpload;
