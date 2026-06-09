import React, { useState, useCallback } from 'react';
import { UploadCloud, File, Copy, Check, ShieldAlert } from 'lucide-react';

export default function DropZone({ onFileSelect, selectedFile, shareLink, isEncrypting }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  }, [onFileSelect]);

  const copyToClipboard = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all duration-300 group cursor-pointer
            ${isDragActive 
              ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]' 
              : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'}`}
        >
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileInput}
          />
          <label htmlFor="file-upload" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
            <div className="p-4 bg-slate-800/80 rounded-2xl mb-4 group-hover:scale-110 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-all duration-300 text-slate-400">
              <UploadCloud className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-semibold text-slate-200 mb-2">Drag & Drop your file</h3>
            <p className="text-sm text-slate-400 mb-6 text-center max-w-sm">
              Files are encrypted locally and streamed directly. No servers involved.
            </p>
            <span className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition-all duration-200 shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
              Browse Files
            </span>
          </label>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-10 -mt-10"></div>
          
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-indigo-500/10 text-indigo-400 rounded-2xl">
              <File className="w-8 h-8" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-indigo-400 font-semibold tracking-wider uppercase mb-1">Selected File</p>
              <h4 className="text-lg font-bold text-slate-100 truncate">{selectedFile.name}</h4>
              <p className="text-sm text-slate-400 mt-1">{formatSize(selectedFile.size)}</p>
            </div>
          </div>

          {isEncrypting ? (
            <div className="mt-6 flex items-center justify-center gap-3 p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-slate-300 font-medium">Securing file & hashing...</span>
            </div>
          ) : shareLink ? (
            <div className="mt-6 space-y-3">
              <label className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                Share Link (Encrypted End-to-End)
              </label>
              
              <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl p-2 pl-4">
                <span className="text-sm text-slate-400 truncate flex-1 font-mono select-all">
                  {shareLink}
                </span>
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95
                    ${copied 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/10'}`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3.5 mt-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>
                  The hash fragment (<code>#key=...</code>) stays in the browser and is never sent to the signaling server. Zero-Knowledge guarantee!
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
