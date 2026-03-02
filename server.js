const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ─── ICE/TURN config endpoint ──────────────────────────────────────────────────
// Free public TURN servers via openrelay.metered.ca
// For production: sign up at https://www.metered.ca and replace credentials
app.get('/ice-config', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:80?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
});

// ─── Socket.IO signalling ──────────────────────────────────────────────────────
let streamerSocket = null;
let viewerSockets = [];

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('streamer-ready', () => {
    streamerSocket = socket;
    console.log('Streamer connected');
    viewerSockets.forEach(v => v.emit('streamer-available'));
  });

  socket.on('viewer-ready', () => {
    viewerSockets.push(socket);
    console.log('Viewer connected, total:', viewerSockets.length);
    if (streamerSocket) socket.emit('streamer-available');
  });

  socket.on('offer', (data) => {
    const viewer = viewerSockets.find(v => v.id === data.to);
    if (viewer) viewer.emit('offer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('answer', (data) => {
    if (streamerSocket) streamerSocket.emit('answer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    if (data.to === 'streamer' && streamerSocket) {
      streamerSocket.emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    } else {
      const viewer = viewerSockets.find(v => v.id === data.to);
      if (viewer) viewer.emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    }
  });

  socket.on('request-stream', () => {
    if (streamerSocket) {
      streamerSocket.emit('new-viewer', { viewerId: socket.id });
    }
  });

  socket.on('disconnect', () => {
    if (socket === streamerSocket) {
      streamerSocket = null;
      viewerSockets.forEach(v => v.emit('streamer-offline'));
      console.log('Streamer disconnected');
    } else {
      viewerSockets = viewerSockets.filter(v => v !== socket);
      console.log('Viewer disconnected, remaining:', viewerSockets.length);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port', PORT));
