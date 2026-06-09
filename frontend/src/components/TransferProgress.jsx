import React from 'react';
import { ArrowUpRight, ArrowDownLeft, Zap, ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';

export default function TransferProgress({ 
  role, 
  fileName, 
  fileSize, 
  progressPercent, 
  bytesTransferred, 
  speedMBs, 
  etaSeconds, 
  status 
}) {
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusText = () => {
    switch (status) {
      case 'encrypting':
        return 'Hashing and preparing encryption key...';
      case 'connecting':
        return 'Connecting to peer over WebRTC...';
      case 'connected':
        return 'Direct peer-to-peer connection established.';
      case 'transferring':
        return role === 'sender' ? 'Encrypting & uploading chunks...' : 'Downloading & saving encrypted chunks...';
      case 'processing':
        return 'Verifying integrity & decrypting chunks locally...';
      case 'completed':
        return 'Transfer completed! SHA-256 verified successfully.';
      case 'failed':
        return 'Transfer aborted or connection dropped.';
      case 'hash_mismatch':
        return 'Hash verification failed! Data may be corrupted.';
      default:
        return 'Idle';
    }
  };

  const isSender = role === 'sender';

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl space-y-6 relative overflow-hidden">
      {/* Background neon mesh light */}
      <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -mr-16 -mt-16 opacity-10 transition-colors duration-500
        ${status === 'completed' ? 'bg-emerald-500' : status === 'failed' || status === 'hash_mismatch' ? 'bg-rose-500' : 'bg-indigo-500'}`}>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider">
            {isSender ? 'Sending File' : 'Receiving File'}
          </span>
          <h4 className="text-lg font-bold text-slate-100 truncate mt-0.5">{fileName}</h4>
          <p className="text-sm text-slate-400 mt-0.5">Total size: {formatSize(fileSize)}</p>
        </div>

        <div className={`p-3 rounded-2xl border
          ${isSender 
            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' 
            : 'bg-teal-500/10 border-teal-500/20 text-teal-400'}`}
        >
          {isSender ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
        </div>
      </div>

      {/* Progress Bar & Percentage */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-xs font-semibold text-slate-400">
            {formatSize(bytesTransferred)} of {formatSize(fileSize)} ({progressPercent}%)
          </span>
          <span className={`text-2xl font-black font-mono tracking-tight
            ${status === 'completed' ? 'text-emerald-400' : status === 'failed' || status === 'hash_mismatch' ? 'text-rose-400' : 'text-indigo-400'}`}>
            {progressPercent}%
          </span>
        </div>

        <div className="h-3.5 bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div 
            className={`h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.4)]
              ${status === 'completed' 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]' 
                : status === 'failed' || status === 'hash_mismatch'
                ? 'bg-gradient-to-r from-rose-650 to-orange-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                : 'bg-gradient-to-r from-indigo-600 to-violet-500 animate-pulse'}`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Grid of stats */}
      <div className="grid grid-cols-2 gap-4">
        {/* Speed */}
        <div className="bg-slate-950/45 border border-slate-800/60 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
            <Zap className="w-4 h-4 fill-amber-400/20" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Transfer Speed</p>
            <p className="text-base font-black text-slate-200 mt-0.5">
              {status === 'transferring' ? `${speedMBs.toFixed(2)} MB/s` : '0.00 MB/s'}
            </p>
          </div>
        </div>

        {/* ETA */}
        <div className="bg-slate-950/45 border border-slate-800/60 rounded-2xl p-4 flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <RefreshCw className={`w-4 h-4 ${status === 'transferring' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Time Remaining</p>
            <p className="text-base font-black text-slate-200 mt-0.5">
              {status === 'transferring' 
                ? (etaSeconds > 3600 
                  ? 'Calculated...' 
                  : etaSeconds > 0 
                  ? `${Math.ceil(etaSeconds)}s` 
                  : 'Done') 
                : '--'}
            </p>
          </div>
        </div>
      </div>

      {/* Transfer status footer */}
      <div className={`flex items-center gap-2.5 p-3.5 border rounded-2xl text-xs font-semibold
        ${status === 'completed' 
          ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-400' 
          : status === 'failed' || status === 'hash_mismatch'
          ? 'bg-rose-500/5 border-rose-500/15 text-rose-400'
          : status === 'processing'
          ? 'bg-purple-500/5 border-purple-500/15 text-purple-400'
          : 'bg-indigo-500/5 border-indigo-500/15 text-indigo-300'}`}
      >
        {status === 'completed' ? (
          <ShieldCheck className="w-4.5 h-4.5 flex-shrink-0 animate-bounce" />
        ) : status === 'failed' || status === 'hash_mismatch' ? (
          <AlertTriangle className="w-4.5 h-4.5 flex-shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
        )}
        <span>{getStatusText()}</span>
      </div>
    </div>
  );
}
