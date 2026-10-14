import React, { useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { ApiClient } from '../lib/api';

interface POUploadViewProps {
  customers: any[];
  onUploadSuccess: (po: any) => void;
}

export const POUploadView: React.FC<POUploadViewProps> = ({ customers, onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?._id || '');
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a purchase order PDF or image file.');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      if (selectedCustomerId) {
        formData.append('customerId', selectedCustomerId);
      }

      const po = await ApiClient.uploadPO(formData);
      onUploadSuccess(po);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Upload Customer Purchase Order</h2>
        <p className="text-sm text-slate-400">
          Upload customer PO documents (PDF or image). Our AI engine extracts table items, dimensions, finishes, and quantities while guarding against duplicates.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-8 rounded-2xl glass-panel space-y-6">
        {/* Customer Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Select Customer / Buyer Organization
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-teal-500"
          >
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} {c.gstin ? `(GSTIN: ${c.gstin})` : ''} - {c.shippingAddress?.state || 'India'}
              </option>
            ))}
          </select>
        </div>

        {/* Drag & Drop Box */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
            selectedFile
              ? 'border-teal-500/60 bg-teal-500/5'
              : 'border-slate-700 hover:border-teal-500/40 bg-slate-900/50 hover:bg-slate-900/80'
          }`}
          onClick={() => document.getElementById('po-file-input')?.click()}
        >
          <input
            id="po-file-input"
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <UploadCloud className="w-7 h-7" />
            </div>

            {selectedFile ? (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-white flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4 text-teal-400" />
                  <span>{selectedFile.name}</span>
                </div>
                <div className="text-xs text-slate-400">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Ready for AI extraction
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-200">
                  Drag and drop your Purchase Order PDF here
                </div>
                <div className="text-xs text-slate-500">
                  or click to browse your local computer (Max 25MB)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Upload Notice</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          disabled={!selectedFile || uploading}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
            !selectedFile || uploading
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-teal-500/25'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Parsing PO Document via Gemini AI Engine...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Upload and Extract Line Items</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
