const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');

const app = express();
app.use(cors({
  origin: 'https://mars-summer-project-git-main-abhishek-vv1.vercel.app/'
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'healthy' });
});

const server = http.createServer(app);

// Mount PeerJS server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});
app.use(peerServer);

// Mount Socket.io
const io = new Server(server, {
  cors: {
    origin: 'https://mars-summer-project-git-main-abhishek-vv1.vercel.app/',
    methods: ['GET', 'POST']
  }
});

// Room state storage (in-memory)
// roomId -> { sender: { socketId, peerId }, receivers: [{ socketId, peerId, status }], metadata }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Sender registers the room
  socket.on('create-room', ({ roomId, peerId, metadata }) => {
    console.log(`Room created: ${roomId} by sender with peerId ${peerId}`);
    rooms.set(roomId, {
      sender: { socketId: socket.id, peerId },
      receivers: [], // Now supports multiple receivers
      metadata: metadata || null
    });
    socket.join(roomId);
  });

  // Receiver joins the room
  socket.on('join-room', ({ roomId, peerId }) => {
    console.log(`Receiver joining room: ${roomId} with peerId ${peerId}`);
    
    if (!rooms.has(roomId)) {
      console.log(`Room ${roomId} not found for receiver`);
      socket.emit('room-error', { message: 'Room does not exist or has expired.' });
      return;
    }

    const roomData = rooms.get(roomId);
    
    // Add receiver to the list (unlimited receivers now supported)
    const receiverIndex = roomData.receivers.length;
    roomData.receivers.push({ socketId: socket.id, peerId, status: 'active' });
    rooms.set(roomId, roomData);
    socket.join(roomId);

    // Notify sender that a receiver joined
    socket.to(roomData.sender.socketId).emit('receiver-joined', { 
      peerId,
      receiverIndex,
      totalReceivers: roomData.receivers.length
    });
    
    // Send sender's peer ID to the receiver
    socket.emit('sender-info', { peerId: roomData.sender.peerId });

    // Send list of all active receivers to the new receiver (for mesh swarming)
    const otherReceivers = roomData.receivers
      .slice(0, -1) // Exclude the one just added
      .map((r, idx) => ({ peerId: r.peerId, index: idx }));
    
    if (otherReceivers.length > 0) {
      socket.emit('peer-list', { peers: otherReceivers });
    }

    // Send file metadata to the receiver if it exists
    if (roomData.metadata) {
      socket.emit('file-metadata', roomData.metadata);
    }
  });

  // Sender updates metadata (e.g. if updated after room creation)
  socket.on('send-metadata', ({ roomId, metadata }) => {
    console.log(`Metadata received for room ${roomId}`);
    if (rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      roomData.metadata = metadata;
      rooms.set(roomId, roomData);
      
      // Broadcast to receiver if present
      if (roomData.receiver) {
        socket.to(roomData.receiver.socketId).emit('file-metadata', metadata);
      }
    }
  });

  // Notify other peer of progress or state updates (optional helper channel)
  socket.on('transfer-signal', ({ roomId, type, data }) => {
    socket.to(roomId).emit('transfer-signal', { type, data });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Search for rooms involving this socket
    for (const [roomId, roomData] of rooms.entries()) {
      if (roomData.sender && roomData.sender.socketId === socket.id) {
        console.log(`Sender disconnected from room ${roomId}`);
        // Notify all receivers
        roomData.receivers.forEach(receiver => {
          io.to(receiver.socketId).emit('peer-disconnected', { role: 'sender' });
        });
        rooms.delete(roomId);
      } else {
        // Check if this socket is a receiver
        const receiverIndex = roomData.receivers.findIndex(r => r.socketId === socket.id);
        if (receiverIndex !== -1) {
          console.log(`Receiver ${receiverIndex} disconnected from room ${roomId}`);
          // Notify sender
          if (roomData.sender) {
            io.to(roomData.sender.socketId).emit('receiver-left', { 
              peerId: roomData.receivers[receiverIndex].peerId,
              totalReceivers: roomData.receivers.length - 1
            });
          }
          // Notify other receivers
          roomData.receivers.forEach((r, idx) => {
            if (idx !== receiverIndex) {
              io.to(r.socketId).emit('peer-disconnected', { 
                role: 'receiver',
                peerId: roomData.receivers[receiverIndex].peerId
              });
            }
          });
          // Remove receiver from list
          roomData.receivers.splice(receiverIndex, 1);
          rooms.set(roomId, roomData);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 5010;
server.listen(PORT, () => {
  console.log(`Signaling and PeerJS Server running on port ${PORT}`);
});
