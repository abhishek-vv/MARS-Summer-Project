# P2P Web Share — Decentralized Browser-to-Browser File Transfer

A lightweight, decentralized peer-to-peer file sharing web application built with **WebRTC**, **Node.js**, and **React.js**. Transfer files directly between browsers without relying on central servers—achieving fast, secure, and cost-effective file sharing.

## 🎯 Objective

Traditional file-sharing services rely on central servers, resulting in heavy bandwidth costs and storage limitations. This project provides a lightweight, decentralized P2P file sharing platform where:

- Users can **drag-and-drop** a file to generate a unique share room link
- Recipients opening the link connect **directly to the sender's browser** to stream the file
- A lightweight central **signaling server** only coordinates the initial WebRTC handshake—it never reads, processes, or stores any file data

## ✨ Key Features — Core MVP

### Share Room Creation
- **Drag-and-drop upload zone** to select files (limit <50MB for standard browser memory)
- **Unique Room ID** or invite link generation for easy sharing

### Signaling Handshake
- Lightweight **Node.js + Socket.io** signaling backend
- Coordinates WebRTC connection offers and answers between peers

### Direct P2P Transfer
- **FileReader API** to read files in the sender's browser
- **WebRTC data channels** for direct peer-to-peer file streaming
- No file data passes through the server

### Basic Chunk Verification
- **SHA-256 cryptographic hashing** of file chunks
- **Hash verification** before and after transfer to guarantee zero data corruption

### Progress Indicators & Connection Status
- Real-time **transfer percentage** display
- **Transfer speed** (MB/s) calculation
- **Active connection status** indicator

### Graceful Disconnect Handling
- Application does **not crash or freeze** on tab closure
- UI **gracefully notifies** the remaining user of connection drops
- Clean resource cleanup on disconnect

### Auto-Download
- **Reassemble incoming verified chunks** in receiver memory
- **Automatically trigger local file download** when all chunks are verified

## 🚀 Advanced Features Implemented

### Multi-Peer Support (Mesh Swarming)
- A third peer joining the room can **download different portions** of the file from both the sender and the second peer simultaneously
- **Efficient chunk distribution** across multiple receivers
- **Receiver-to-receiver** data sharing for improved network utilization

### Zero-Knowledge Encryption
- **Client-side AES-GCM encryption** using the Web Crypto API
- Encryption key remains **invisible to the server**
- Passed via **URL hash** (e.g., `/#key=...`) for zero-knowledge architecture
- Provides end-to-end encryption from sender to receiver

### Large File Support (Optional)
- Support for files **>50MB** with chunking strategy
- **OPFS (Origin Private File System)** integration for >500MB files
- **IndexedDB fallback** for storage optimization

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React.js, Vite, Tailwind CSS |
| **P2P Communication** | WebRTC API, PeerJS |
| **Backend Signaling** | Node.js, Express.js, Socket.io |
| **Encryption** | Web Crypto API (AES-GCM), SHA-256 |
| **Storage** | IndexedDB, OPFS |
| **Hosting** | Vercel / Netlify (Frontend), Render / Railway (Backend) |

## 📋 Installation & Setup

### Prerequisites
- **Node.js** (v16+)
- **npm** or **yarn**

### Clone the Repository
```bash
git clone <repository-url>
cd p2p-web-share
```

### Setup
```bash
npm run install-all
npm run dev
```
The frontend application will be available at `http://localhost:5173` and backend server will start on `http://localhost:5010`

## 🌐 Usage

### As a Sender
1. Open the application in your browser
2. Select **"Send File"** (default role)
3. **Drag and drop** a file onto the upload zone, or click to browse
4. A unique **share room link** will be generated (includes encrypted key in URL hash)
5. **Copy and share** the link with your recipient(s)
6. The application will show **real-time transfer progress** and speed

### As a Receiver
1. Open the **shared room link** in your browser
2. You will automatically connect to the sender's peer
3. The file will **download directly** to your browser
4. Upon completion, the file **automatically downloads** locally
5. Hash verification confirms **zero data corruption**

### Multi-Peer Scenario
1. **Sender** creates a room and shares the link
2. **Receiver 1** opens the link and begins downloading
3. **Receiver 2** joins the same room later
4. Receiver 2 can download directly from the sender **and** from Receiver 1 in parallel
5. The system automatically distributes chunks for optimal throughput

## 🔒 Security

- **End-to-End Encryption**: All file data is encrypted in the sender's browser using AES-GCM before transmission
- **Server-Blind**: The signaling server has **zero access** to file contents or encryption keys
- **Hash Verification**: SHA-256 hashing ensures integrity—any corruption is detected
- **URL-Based Key**: Encryption key is transmitted via URL hash `#key=...`, keeping it out of server logs

## 📊 Performance Considerations

- **Chunk Size**: 16KB per chunk (optimized for WebRTC data channel throughput)
- **Backpressure Handling**: Automatic pausing when WebRTC buffer exceeds 1MB
- **Progress Calculation**: Real-time speed and ETA computation
- **Browser Compatibility**: Works on modern browsers supporting WebRTC, FileReader, Web Crypto API, and IndexedDB

## 🔧 Deployment

### Frontend (Vercel / Netlify)
```bash
# Build
cd frontend
npm run build

# Deploy dist/ folder to Vercel or Netlify
```

### Backend (Render / Railway)
```bash
# Push backend/ directory to Render or Railway
# Set environment variable: PORT=5010 (or your chosen port)
```

Ensure the `VITE_BACKEND_URL` environment variable in the frontend is set to your deployed backend URL.

## 📝 Project Structure

```
p2p-web-share/
├── backend/
│   ├── server.js          # Socket.io + PeerJS signaling server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React component with multi-peer support
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── DropZone.jsx
│   │   │   ├── TransferProgress.jsx
│   │   │   └── ConnectionStatus.jsx
│   │   └── utils/
│   │       ├── crypto.js           # AES-GCM encryption, SHA-256 hashing
│   │       ├── db.js               # IndexedDB & OPFS storage
│   │       └── chunkDistributor.js # Multi-peer chunk distribution logic
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 🚀 How to Test the Transfer

1. Open http://localhost:5173 in a browser tab
2. Drag and drop or browse to select a file
3. A unique **share room link** will be generated
4. Copy the link
5. Open a **new browser window** (or Chrome Incognito / another browser) and paste the link
6. The receiver will connect and the file will **download automatically**
7. Hash verification confirms **zero data corruption**
8. Try closing the sender tab mid-transfer to verify graceful disconnect handling

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, fork the repository, and create pull requests.

## 📄 License

MIT License — Open source and free to use.

## 🎯 Future Enhancements

- Selective chunk downloading for optimized mesh swarming
- Connection churn recovery with automatic resume support
- UI improvements and accessibility enhancements
- Password-protected rooms for access control

---

**P2P Web Share** — Fast, Secure, Decentralized File Sharing. Built as part of MARS Open Projects 2026.
