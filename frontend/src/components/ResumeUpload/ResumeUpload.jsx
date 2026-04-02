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

function ResumeUpload({ onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
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
      setError('Please choose a resume file before uploading.');
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

      const data = await response.json();
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

      const analysisData = await analysisResponse.json();
      if (!analysisResponse.ok) {
        throw new Error(analysisData.message || 'Resume analysis failed.');
      }

      setSuccessMessage(`${data.resume.originalName} uploaded and analyzed successfully.`);
      if (onUploadSuccess) {
        onUploadSuccess({
          ...data.resume,
          analysis: analysisData.analysis,
          extractedTextPreview: analysisData.extractedTextPreview,
        });
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
