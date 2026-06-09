import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';
import {
  Zap,
  Shield,
  RefreshCw,
  Trash2,
  AlertCircle,
  Download,
  FileCheck,
  Globe
} from 'lucide-react';

import DropZone from './components/DropZone';
import ConnectionStatus from './components/ConnectionStatus';
import TransferProgress from './components/TransferProgress';

import {
  generateAESKey,
  exportKeyToHex,
  importKeyFromHex,
  encryptChunk,
  decryptChunk,
  computeSHA256
} from './utils/crypto';

import {
  initDB,
  saveChunk,
  getAllChunks,
  deleteDB,
  isOPFSAvailable,
  shouldUseOPFS,
  initOPFS,
  saveChunkOPFS,
  getAllChunksOPFS,
  deleteOPFS
} from './utils/db';

import {
  distributeChunkRanges,
  getChunkAssignments,
  receiverHasChunk,
  getDownloadedChunks
} from './utils/chunkDistributor';

const CHUNK_SIZE = 16384; // 16KB safe chunk size
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Helper to dynamically parse PeerJS connection details from BACKEND_URL
const getPeerConfig = () => {
  const url = new URL(BACKEND_URL);
  const secure = url.protocol === 'https:';

  let port = url.port;
  if (!port) {
    port = secure ? '443' : '80';
  }

  return {
    host: url.hostname,
    port: parseInt(port),
    path: '/peerjs',
    secure: secure,
    debug: 1 // Errors only
  };
};

export default function App() {
  // App Role & Routing
  const [role, setRole] = useState('sender'); // 'sender' | 'receiver'
  const [roomId, setRoomId] = useState('');
  const [aesKey, setAesKey] = useState(null);

  // File State
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [isEncrypting, setIsEncrypting] = useState(false);

  // Storage Backend State
  const [useOPFS, setUseOPFS] = useState(false);
  const [opfsHandle, setOpfsHandle] = useState(null);

  // Mesh Swarming State
  const [receiverList, setReceiverList] = useState([]);
  const [receiverIndex, setReceiverIndex] = useState(-1);
  const [totalReceivers, setTotalReceivers] = useState(1);
  const [peerConnections, setPeerConnections] = useState({}); // peerId -> connection object

  // Connection State
  const [serverConnected, setServerConnected] = useState(false);
  const [peerStatus, setPeerStatus] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'
  const [transferStatus, setTransferStatus] = useState('idle'); // 'idle' | 'encrypting' | 'connecting' | 'transferring' | 'processing' | 'completed' | 'failed' | 'hash_mismatch'
  const [peerId, setPeerId] = useState('');

  // Progress Stats
  const [bytesTransferred, setBytesTransferred] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [speedMBs, setSpeedMBs] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Refs for tracking flow control and stats
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const speedIntervalRef = useRef(null);
  const bytesLastIntervalRef = useRef(0);
  const startTimeRef = useRef(0);
  const activeChunksReceivedRef = useRef(new Set());
  const metadataRef = useRef(null);

  // Check URL path on mount to determine if this is a receiver room
  useEffect(() => {
    const pathParts = window.location.pathname.split('/');
    const roomIndex = pathParts.indexOf('room');
    const urlRoomId = roomIndex !== -1 && pathParts[roomIndex + 1] ? pathParts[roomIndex + 1] : null;

    let active = true;

    if (urlRoomId) {
      setRole('receiver');
      setRoomId(urlRoomId);
      setTransferStatus('connecting');
      setPeerStatus('connecting');

      // Extract cryptographic key from URL hash
      const keyFromHash = window.location.hash.startsWith('#key=')
        ? window.location.hash.substring(5)
        : null;

      if (keyFromHash) {
        importKeyFromHex(keyFromHash)
          .then(key => {
            if (!active) return;
            setAesKey(key);
            initializeReceiver(urlRoomId, key);
          })
          .catch(err => {
            if (!active) return;
            console.error('Failed to import AES key:', err);
            setErrorMsg('Invalid or corrupted security key in URL.');
            setTransferStatus('failed');
            setPeerStatus('error');
          });
      } else {
        setErrorMsg('Security key missing in room link. End-to-end decryption is unavailable.');
        setTransferStatus('failed');
        setPeerStatus('error');
      }
    }

    return () => {
      active = false;
      // Clean up connections if they were initialized
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      stopStatsCalculator();
    };
  }, []);

  // Initialize Socket and PeerJS for Sender
  const initializeSender = async (file) => {
    try {
      setIsEncrypting(true);
      setErrorMsg('');

      // 1. Hash file
      const fileBuffer = await file.arrayBuffer();
      const fileHash = await computeSHA256(fileBuffer);

      // 2. Generate E2E Crypto Key
      const key = await generateAESKey();
      const hexKey = await exportKeyToHex(key);
      setAesKey(key);

      // 3. Generate Room details
      const generatedRoomId = crypto.randomUUID();
      setRoomId(generatedRoomId);

      const metadata = {
        name: file.name,
        size: file.size,
        type: file.type,
        totalChunks: Math.ceil(file.size / CHUNK_SIZE),
        fileHash
      };
      setFileMetadata(metadata);
      metadataRef.current = metadata;

      // 4. Generate Share link (Key resides in URL hash, invisible to the server)
      const generatedLink = `${window.location.origin}/room/${generatedRoomId}#key=${hexKey}`;
      setShareLink(generatedLink);
      setIsEncrypting(false);
      setTransferStatus('connecting'); // Show connecting state while waiting for receiver

      // 5. Connect to Socket Signaling Server
      const socket = io(BACKEND_URL, {
        transports: ['polling'],
        reconnection: true
      });
      socketRef.current = socket;

      // 6. Connect to local PeerJS server (dynamic ID)
      const peerConfig = getPeerConfig();
      const peer = new Peer(peerConfig);
      peerRef.current = peer;

      peer.on('open', (id) => {
        setPeerId(id);
        console.log('Sender PeerJS registered with ID:', id);
        setPeerStatus('idle');

        // Register room on server once we have our Peer ID
        if (socket.connected) {
          socket.emit('create-room', {
            roomId: generatedRoomId,
            peerId: id,
            metadata
          });
        } else {
          socket.on('connect', () => {
            setServerConnected(true);
            console.log('Sender socket connected:', socket.id);
            socket.emit('create-room', {
              roomId: generatedRoomId,
              peerId: id,
              metadata
            });
          });
        }
      });

      socket.on('connect', () => {
        setServerConnected(true);
      });

      socket.on('disconnect', () => {
        setServerConnected(false);
      });

      peer.on('error', (err) => {
        console.error('Sender PeerJS error:', err);
        setPeerStatus('error');
        setErrorMsg('PeerJS server connection failed.');
      });

      // Listen for incoming Peer data connections (Receiver connecting to Sender)
      peer.on('connection', (conn) => {
        console.log('Receiver connected via WebRTC:', conn.peer);
        connRef.current = conn;
        setPeerStatus('connected');
        setTransferStatus('transferring');

        conn.on('open', () => {
          // Trigger file transfer
          startSendingFile(conn, file, metadata, key);
        });

        conn.on('close', () => {
          handlePeerDisconnect('receiver');
        });

        conn.on('error', (err) => {
          console.error('RTC connection error:', err);
          handlePeerDisconnect('receiver');
        });
      });

      // Listen for new receivers joining (for multi-peer awareness)
      socket.on('receiver-joined', ({ peerId, receiverIndex, totalReceivers }) => {
        console.log(`Receiver ${receiverIndex} joined room. Total receivers: ${totalReceivers}`);
        setTotalReceivers(totalReceivers);
        setReceiverList(prev => [...prev, { peerId, index: receiverIndex }]);
      });

      // Listen for clean socket-based disconnect signals
      socket.on('peer-disconnected', ({ role }) => {
        if (role === 'receiver') {
          handlePeerDisconnect('receiver');
        }
      });

    } catch (err) {
      console.error('Error starting sender:', err);
      setIsEncrypting(false);
      setErrorMsg('Failed to initialize local file encryption.');
    }
  };

  // Initialize Socket and PeerJS for Receiver
  const initializeReceiver = (urlRoomId, key) => {
    // 1. Connect to Socket Signaling Server
    const socket = io(BACKEND_URL, {
      transports: ['polling'],
      reconnection: true
    });
    socketRef.current = socket;

    // 2. Connect to local PeerJS server (dynamic ID)
    const peerConfig = getPeerConfig();
    const peer = new Peer(peerConfig);
    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      console.log('Receiver PeerJS registered with ID:', id);

      // Join room via socket
      if (socket.connected) {
        socket.emit('join-room', {
          roomId: urlRoomId,
          peerId: id
        });
      } else {
        socket.on('connect', () => {
          setServerConnected(true);
          console.log('Receiver socket connected:', socket.id);
          socket.emit('join-room', {
            roomId: urlRoomId,
            peerId: id
          });
        });
      }
    });

    socket.on('connect', () => {
      setServerConnected(true);
    });

    socket.on('disconnect', () => {
      setServerConnected(false);
    });

    socket.on('room-error', ({ message }) => {
      setErrorMsg(message);
      setTransferStatus('failed');
      setPeerStatus('error');
    });

    // Receive metadata from Sender via socket
    socket.on('file-metadata', async (metadata) => {
      console.log('File metadata received:', metadata);
      setFileMetadata(metadata);
      metadataRef.current = metadata;

      // Determine if we should use OPFS for large files
      const opfsAvailable = await isOPFSAvailable();
      const shouldUseOPFSStorage = opfsAvailable && shouldUseOPFS(metadata.size);
      setUseOPFS(shouldUseOPFSStorage);

      if (shouldUseOPFSStorage) {
        console.log('Using OPFS for large file transfer (>500MB)');
        try {
          const { fileHandle } = await initOPFS(urlRoomId, metadata.name);
          setOpfsHandle(fileHandle);
        } catch (err) {
          console.error('OPFS initialization failed, falling back to IndexedDB:', err);
          setUseOPFS(false);
          await initDB(urlRoomId).catch(initErr => {
            console.error('IndexedDB initialization also failed:', initErr);
            setErrorMsg('Failed to initialize browser storage.');
          });
        }
      } else {
        // Initialize IndexedDB for smaller files
        await initDB(urlRoomId).catch(err => {
          console.error('IndexedDB initialization failed:', err);
          setErrorMsg('Failed to initialize browser storage.');
        });
      }
    });

    // Receive sender's dynamic Peer ID from Socket.io, and connect via WebRTC
    socket.on('sender-info', ({ peerId: senderPeerId }) => {
      console.log('Sender info received, connecting to Peer ID:', senderPeerId);

      // Connect directly to Sender
      const conn = peer.connect(senderPeerId, {
        serialization: 'binary', // Binary data transmission
        reliable: true
      });
      connRef.current = conn;

      conn.on('open', () => {
        console.log('Connected to Sender WebRTC data channel');
        setPeerStatus('connected');
        setTransferStatus('transferring');
        startStatsCalculator();
      });

      conn.on('data', async (data) => {
        if (metadataRef.current) {
          await handleReceivedChunk(data, urlRoomId, metadataRef.current, key);
        } else {
          console.error("Received data but metadata is not available yet!");
        }
      });

      conn.on('close', () => {
        handlePeerDisconnect('sender');
      });

      conn.on('error', (err) => {
        console.error('Data channel error:', err);
        handlePeerDisconnect('sender');
      });
    });

    peer.on('error', (err) => {
      console.error('Receiver PeerJS error:', err);
      setPeerStatus('error');
      setErrorMsg('Could not reach PeerJS server.');
    });

    // Listen for incoming peer connections from other receivers
    peer.on('connection', (conn) => {
      const remotePeerId = conn.peer;
      console.log(`💬 Incoming peer data channel connection from: ${remotePeerId}`);

      conn.on('open', () => {
        console.log(`✅ [Receiver] Accepted connection from peer ${remotePeerId}`);
        setPeerConnections(prev => ({
          ...prev,
          [remotePeerId]: { connection: conn, status: 'connected' }
        }));
      });

      conn.on('data', async (data) => {
        console.log(`📦 [Receiver] Received chunk from peer ${remotePeerId}`);
        if (metadataRef.current) {
          await handleReceivedChunk(data, urlRoomId, metadataRef.current, key);
        }
      });

      conn.on('close', () => {
        console.log(`⚠️ [Receiver] Peer connection closed from ${remotePeerId}`);
        setPeerConnections(prev => {
          const updated = { ...prev };
          delete updated[remotePeerId];
          return updated;
        });
      });

      conn.on('error', (err) => {
        console.error(`❌ [Receiver] Error from peer connection ${remotePeerId}:`, err);
        setPeerConnections(prev => {
          const updated = { ...prev };
          delete updated[remotePeerId];
          return updated;
        });
      });
    });

    // Handle peer list for multi-peer mesh swarming
    socket.on('peer-list', ({ peers }) => {
      console.log('🔗 Peer list received for mesh swarming:', peers);
      setReceiverList(peers);

      // Connect to other receivers for chunk sharing
      if (peers && peers.length > 0) {
        peers.forEach(({ peerId, index }) => {
          console.log(`🔌 Attempting to connect to receiver ${index} with peerId: ${peerId}`);
          connectToReceiver(peerId, index, peer);
        });
      } else {
        console.log('No other receivers to connect to');
      }
    });

    // Listen for clean socket-based disconnect signals
    socket.on('peer-disconnected', ({ role, peerId }) => {
      console.log(`❌ Peer disconnected - role: ${role}, peerId: ${peerId}`);
      if (role === 'sender') {
        handlePeerDisconnect('sender');
      } else if (role === 'receiver') {
        // A peer receiver disconnected - clean up connection
        disconnectFromReceiver(peerId);
      }
    });
  };

  // Establish data channel connection with another receiver for chunk sharing (mesh swarming)
  const connectToReceiver = (peerId, receiverIndex, peerInstance) => {
    if (!peerInstance) {
      console.error('❌ PeerJS instance not available for receiver connection');
      return;
    }

    if (!peerId) {
      console.error('❌ Receiver peerId is missing');
      return;
    }

    console.log(`🔌 [Receiver ${receiverIndex}] Connecting to peer ${peerId}...`);

    try {
      const conn = peerInstance.connect(peerId, {
        serialization: 'binary',
        reliable: true
      });

      conn.on('open', () => {
        console.log(`✅ [Receiver ${receiverIndex}] Connected to peer ${peerId} for chunk exchange`);
        setPeerConnections(prev => ({
          ...prev,
          [peerId]: { connection: conn, receiverIndex, status: 'connected' }
        }));
      });

      conn.on('data', async (data) => {
        console.log(`📦 [Receiver ${receiverIndex}] Received chunk from peer`);
        if (metadataRef.current) {
          await handleReceivedChunk(data, roomId, metadataRef.current, aesKey);
        }
      });

      conn.on('close', () => {
        console.log(`⚠️ [Receiver ${receiverIndex}] Disconnected from peer`);
        disconnectFromReceiver(peerId);
      });

      conn.on('error', (err) => {
        console.error(`❌ [Receiver ${receiverIndex}] Error with peer connection:`, err);
        disconnectFromReceiver(peerId);
      });
    } catch (err) {
      console.error(`❌ [Receiver ${receiverIndex}] Failed to create connection:`, err);
    }
  };

  // Clean up connection with a specific receiver peer
  const disconnectFromReceiver = (peerId) => {
    setPeerConnections(prev => {
      const updated = { ...prev };
      if (updated[peerId]) {
        updated[peerId].connection.close();
        delete updated[peerId];
      }
      return updated;
    });
  };

  // Handles clean sender chunk reading & backpressure WebRTC transmission
  const startSendingFile = (conn, file, metadata, key) => {
    let currentChunk = 0;
    let isPausedForBuffer = false;
    const totalChunks = metadata.totalChunks;

    startStatsCalculator();

    const sendNext = () => {
      if (currentChunk >= totalChunks) {
        console.log('All chunks queued to WebRTC buffer.');
        setTransferStatus('completed');
        return;
      }

      // Backpressure logic: Pause if data channel buffer gets too high (>1MB)
      const dataChannel = conn.dataChannel;
      if (dataChannel && dataChannel.bufferedAmount > 1024 * 1024) {
        isPausedForBuffer = true;
        return;
      }

      const offset = currentChunk * CHUNK_SIZE;
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const rawBuffer = e.target.result;

          // Encrypt raw ArrayBuffer chunk (returns iv + ciphertext)
          const encryptedBuffer = await encryptChunk(rawBuffer, key);

          // Package binary packet: [4-byte ChunkIndex][EncryptedPayload]
          const packet = new Uint8Array(4 + encryptedBuffer.byteLength);
          new DataView(packet.buffer).setUint32(0, currentChunk, true);
          packet.set(new Uint8Array(encryptedBuffer), 4);

          conn.send(packet.buffer);

          // Track progress using original unencrypted size
          currentChunk++;
          const bytesSent = Math.min(file.size, currentChunk * CHUNK_SIZE);
          setBytesTransferred(bytesSent);
          setProgressPercent(Math.round((bytesSent / file.size) * 100));

          // Recursively stream next chunk
          sendNext();
        } catch (err) {
          console.error('Failed to encrypt/send chunk:', err);
          setTransferStatus('failed');
        }
      };

      reader.readAsArrayBuffer(slice);
    };

    // Configure WebRTC low buffer event listener
    const dataChannel = conn.dataChannel;
    if (dataChannel) {
      dataChannel.bufferedAmountLowThreshold = 256 * 1024; // 256KB
      dataChannel.onbufferedamountlow = () => {
        if (isPausedForBuffer) {
          isPausedForBuffer = false;
          sendNext();
        }
      };
    }

    // Trigger first read
    sendNext();
  };

  // Handles receiver parsing, storing, progress tracking, and compilation
  const handleReceivedChunk = async (data, room, metadata, key) => {
    try {
      let buffer = data;

      // Handle different data types from PeerJS binary mode
      if (data instanceof Blob) {
        buffer = await data.arrayBuffer();
      } else if (data instanceof Uint8Array || data instanceof Array) {
        // Convert Uint8Array or Array to ArrayBuffer
        buffer = new Uint8Array(data).buffer;
      } else if (!(buffer instanceof ArrayBuffer)) {
        // Last resort: ensure we have an ArrayBuffer
        if (buffer && buffer.buffer instanceof ArrayBuffer) {
          buffer = buffer.buffer;
        } else {
          throw new Error('Received data is not in expected format');
        }
      }

      // Parse Header
      const dataView = new DataView(buffer);
      const chunkIndex = dataView.getUint32(0, true);
      const encryptedPayload = buffer.slice(4);

      // Store chunk using appropriate backend (OPFS or IndexedDB)
      if (useOPFS && opfsHandle) {
        await saveChunkOPFS(opfsHandle, chunkIndex, encryptedPayload, false);
      } else {
        await saveChunk(room, chunkIndex, encryptedPayload);
      }

      // Track progress
      activeChunksReceivedRef.current.add(chunkIndex);
      const chunksCount = activeChunksReceivedRef.current.size;

      // Calculate unencrypted bytes received (encrypted payload overhead is exactly 28 bytes)
      const chunkOriginalSize = encryptedPayload.byteLength - 28;
      setBytesTransferred(prev => {
        const newVal = prev + chunkOriginalSize;
        setProgressPercent(Math.round((newVal / metadata.size) * 100));
        return newVal;
      });

      // Check if file is fully downloaded
      if (chunksCount === metadata.totalChunks) {
        stopStatsCalculator();
        setTransferStatus('processing');
        setPeerStatus('idle'); // Stop showing connected as we assemble

        await assembleAndDownloadFile(room, metadata, key);
      }
    } catch (err) {
      console.error('Failed processing received chunk:', err);
      setTransferStatus('failed');
    }
  };

  // Retrieve encrypted chunks from storage backend, decrypt, verify SHA-256 and trigger auto-download
  const assembleAndDownloadFile = async (room, metadata, key) => {
    try {
      let encryptedChunks;

      // Retrieve chunks from appropriate backend
      if (useOPFS && opfsHandle) {
        console.log('Reading chunks from OPFS...');
        encryptedChunks = await getAllChunksOPFS(opfsHandle, metadata.totalChunks);
      } else {
        console.log('Reading chunks from IndexedDB...');
        encryptedChunks = await getAllChunks(room);
      }

      const decryptedBuffers = [];
      let totalDecryptedSize = 0;

      // 1. Decrypt chunks in order
      for (let i = 0; i < metadata.totalChunks; i++) {
        const encrypted = encryptedChunks[i];
        if (!encrypted) {
          throw new Error(`Missing chunk index ${i}`);
        }
        const decrypted = await decryptChunk(encrypted, key);
        decryptedBuffers.push(decrypted);
        totalDecryptedSize += decrypted.byteLength;
      }

      // 2. Concatenate buffers to check integrity
      const finalBuffer = new Uint8Array(totalDecryptedSize);
      let offset = 0;
      for (const buf of decryptedBuffers) {
        finalBuffer.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }

      // 3. Verify SHA-256
      const computedHash = await computeSHA256(finalBuffer.buffer);
      console.log('Verification: Orig Hash:', metadata.fileHash, 'Computed:', computedHash);

      if (computedHash === metadata.fileHash) {
        setTransferStatus('completed');

        // 4. Trigger auto-download
        const fileBlob = new Blob(decryptedBuffers, { type: metadata.type });
        const downloadUrl = URL.createObjectURL(fileBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = metadata.name;
        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        // Clean up storage
        if (useOPFS) {
          await deleteOPFS(room);
        } else {
          await deleteDB(room);
        }
      } else {
        console.error('SHA-256 hash mismatch!');
        setTransferStatus('hash_mismatch');
        if (useOPFS) {
          await deleteOPFS(room);
        } else {
          await deleteDB(room);
        }
      }
    } catch (err) {
      console.error('Assembly / decryption failed:', err);
      setTransferStatus('failed');
      if (useOPFS) {
        await deleteOPFS(room);
      } else {
        await deleteDB(room);
      }
    }
  };

  // Stats Calculator for Speed & ETA
  const startStatsCalculator = () => {
    startTimeRef.current = Date.now();
    bytesLastIntervalRef.current = 0;

    speedIntervalRef.current = setInterval(() => {
      setBytesTransferred(currBytes => {
        const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;

        if (elapsedSeconds > 0) {
          const speed = currBytes / elapsedSeconds; // B/s
          setSpeedMBs(speed / (1024 * 1024));

          setFileMetadata(meta => {
            if (meta) {
              const remainingBytes = meta.size - currBytes;
              setEtaSeconds(speed > 0 ? remainingBytes / speed : 0);
            }
            return meta;
          });
        }
        return currBytes;
      });
    }, 1000);
  };

  const stopStatsCalculator = () => {
    if (speedIntervalRef.current) {
      clearInterval(speedIntervalRef.current);
      speedIntervalRef.current = null;
    }
  };

  // Handle peer disconnection
  const handlePeerDisconnect = (disconnectedRole) => {
    console.log(`Connection dropped by ${disconnectedRole}`);
    stopStatsCalculator();
    setPeerStatus('disconnected');

    setTransferStatus(prev => {
      if (prev !== 'completed') {
        return 'failed';
      }
      return prev;
    });
  };

  // Reset page to upload another file
  const handleReset = async () => {
    stopStatsCalculator();

    // Close connections
    if (connRef.current) connRef.current.close();
    if (peerRef.current) peerRef.current.destroy();
    if (socketRef.current) socketRef.current.disconnect();

    if (roomId) {
      await deleteDB(roomId);
    }

    // Reset state
    setSelectedFile(null);
    setFileMetadata(null);
    metadataRef.current = null;
    setRoomId('');
    setAesKey(null);
    setShareLink('');
    setBytesTransferred(0);
    setProgressPercent(0);
    setSpeedMBs(0);
    setEtaSeconds(0);
    setTransferStatus('idle');
    setPeerStatus('idle');
    setRole('sender');
    setServerConnected(false);
    setErrorMsg('');
    activeChunksReceivedRef.current.clear();

    // Clean URL
    window.history.pushState({}, document.title, '/');
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 md:p-8 max-w-5xl mx-auto w-full relative z-10">
      {/* Decorative top background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-87.5 bg-indigo-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"></div>

      {/* Header */}
      <header className="flex flex-col items-center justify-center text-center mt-6 mb-8 md:mt-12 md:mb-12 space-y-3">
        <div className="inline-flex items-center justify-center p-3.5 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.15)] animate-pulse">
          <Zap className="w-7 h-7 fill-indigo-400/20" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black bg-linear-to-r from-slate-50 via-slate-100 to-indigo-300 bg-clip-text text-transparent tracking-tight">
          P2P Web Share
        </h1>
        <p className="text-sm md:text-base text-slate-400 max-w-md font-medium">
          Decentralized, encrypted browser-to-browser file transfer.
        </p>
      </header>

      {/* Main Content Card */}
      <main className="flex-1 flex flex-col justify-center items-center py-4 w-full">
        {errorMsg && (
          <div className="w-full max-w-2xl mb-6 bg-rose-500/5 border border-rose-500/20 text-rose-400 rounded-3xl p-5 flex items-start gap-3.5 shadow-lg">
            <AlertCircle className="w-5 h-5 flex shrink-0 mt-0.5" />
            <div className="flex-1">
              <h5 className="font-bold text-slate-100 mb-1">An error occurred</h5>
              <p className="text-sm leading-relaxed">{errorMsg}</p>
              <button
                onClick={handleReset}
                className="mt-3 text-xs bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 font-semibold px-4 py-2 rounded-xl transition-all duration-200"
              >
                Go Back Home
              </button>
            </div>
          </div>
        )}

        {!errorMsg && (
          <div className="w-full space-y-6">
            {role === 'sender' && transferStatus === 'idle' && (
              <DropZone
                onFileSelect={(file) => {
                  setSelectedFile(file);
                  initializeSender(file);
                }}
                selectedFile={selectedFile}
                shareLink={shareLink}
                isEncrypting={isEncrypting}
              />
            )}

            {role === 'sender' && selectedFile && transferStatus !== 'idle' && (
              <>
                <TransferProgress
                  role="sender"
                  fileName={selectedFile.name}
                  fileSize={selectedFile.size}
                  progressPercent={progressPercent}
                  bytesTransferred={bytesTransferred}
                  speedMBs={speedMBs}
                  etaSeconds={etaSeconds}
                  status={transferStatus}
                />

                {shareLink && (
                  <div className="w-full max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-xl space-y-4">
                    <label className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                      <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
                      Share Link (Encrypted End-to-End)
                    </label>

                    <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl p-2 pl-4">
                      <span className="text-sm text-slate-400 truncate flex-1 font-mono select-all">
                        {shareLink}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(shareLink);
                          alert('Link copied to clipboard!');
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Link
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                      <svg className="w-4 h-4 flex shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span>Share this link with the receiver. The encryption key stays in the browser.</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {role === 'receiver' && fileMetadata && (
              <TransferProgress
                role="receiver"
                fileName={fileMetadata.name}
                fileSize={fileMetadata.size}
                progressPercent={progressPercent}
                bytesTransferred={bytesTransferred}
                speedMBs={speedMBs}
                etaSeconds={etaSeconds}
                status={transferStatus}
              />
            )}

            {role === 'receiver' && !fileMetadata && transferStatus !== 'failed' && (
              <div className="w-full max-w-2xl mx-auto bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-4 shadow-xl backdrop-blur-xl flex flex-col items-center">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <h3 className="text-lg font-bold text-slate-200">Connecting to Room...</h3>
                <p className="text-sm text-slate-400 max-w-xs">
                  Waiting for sender to establish connection. Keep this tab open.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Global Action buttons */}
        {(transferStatus === 'completed' || transferStatus === 'failed' || transferStatus === 'hash_mismatch' || (role === 'sender' && selectedFile && transferStatus === 'idle')) && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 font-semibold border border-slate-800 rounded-2xl transition-all duration-200 shadow-md active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              {transferStatus === 'completed' ? 'Transfer Another File' : 'Cancel & Reset'}
            </button>
          </div>
        )}
      </main>

      {/* Connection Bar Footer */}
      <footer className="mt-8 mb-4">
        <div className="bg-slate-900/40 border border-slate-900 rounded-full py-3 px-6 shadow-sm backdrop-blur-md max-w-xl mx-auto">
          <ConnectionStatus
            serverConnected={serverConnected}
            peerStatus={peerStatus}
            isReceiver={role === 'receiver'}
          />
        </div>

        {/* Security badge */}
        <div className="flex justify-center items-center gap-1.5 mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 text-indigo-400" />
          <span>Zero Knowledge End-To-End Encrypted via AES-GCM-256</span>
          <Globe className="w-3.5 h-3.5 text-emerald-400 ml-2" />
          <span>Server-Blind WebRTC Direct Stream</span>
        </div>
      </footer>
    </div>
  );
}
