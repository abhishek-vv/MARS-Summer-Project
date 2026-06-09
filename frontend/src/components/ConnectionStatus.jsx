import React from 'react';
import { Server, Zap, AlertTriangle, Loader2 } from 'lucide-react';

export default function ConnectionStatus({ serverConnected, peerStatus, isReceiver }) {
  const getPeerStatusInfo = () => {
    switch (peerStatus) {
      case 'idle':
        return {
          label: 'Waiting for connection...',
          color: 'text-slate-400 bg-slate-800/40 border-slate-800',
          icon: <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        };
      case 'connecting':
        return {
          label: 'Establishing secure link...',
          color: 'text-indigo-400 bg-indigo-500/5 border-indigo-500/20',
          icon: <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
        };
      case 'connected':
        return {
          label: 'Direct P2P Link Active',
          color: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20',
          icon: <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400/20 animate-pulse" />
        };
      case 'disconnected':
        return {
          label: 'Peer Disconnected',
          color: 'text-rose-400 bg-rose-500/5 border-rose-500/20',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400" />
        };
      case 'error':
        return {
          label: 'Connection Error',
          color: 'text-rose-400 bg-rose-500/5 border-rose-500/20',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400" />
        };
      default:
        return {
          label: 'Unknown',
          color: 'text-slate-400 bg-slate-800 border-slate-800',
          icon: null
        };
    }
  };

  const peerInfo = getPeerStatusInfo();

  return (
    <div className="flex flex-wrap items-center gap-3 justify-center text-xs font-semibold">
      {/* Server Status */}
      <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border transition-all duration-300
        ${serverConnected 
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' 
          : 'bg-rose-500/5 border-rose-500/20 text-rose-400 animate-pulse'}`}
      >
        <Server className="w-3.5 h-3.5" />
        <span>Signaling: {serverConnected ? 'Connected' : 'Connecting...'}</span>
        <span className={`w-1.5 h-1.5 rounded-full ${serverConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
      </div>

      {/* Peer Status */}
      {peerStatus !== 'idle' || !isReceiver ? (
        <div className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border transition-all duration-300 ${peerInfo.color}`}>
          {peerInfo.icon}
          <span>{peerInfo.label}</span>
        </div>
      ) : null}
    </div>
  );
}
