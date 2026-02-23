const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let streamerSocket = null;
let viewerSockets = [];

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Phone registers as streamer
  socket.on('streamer-ready', () => {
    streamerSocket = socket;
    console.log('Streamer connected');
    // Notify all waiting viewers
    viewerSockets.forEach(v => v.emit('streamer-available'));
  });

  // PC registers as viewer
  socket.on('viewer-ready', () => {
    viewerSockets.push(socket);
    console.log('Viewer connected, total:', viewerSockets.length);
    // If streamer already online, notify this viewer
    if (streamerSocket) socket.emit('streamer-available');
  });

  // WebRTC signaling relay
  socket.on('offer', (data) => {
    // Streamer sends offer to a specific viewer
    const viewer = viewerSockets.find(v => v.id === data.to);
    if (viewer) viewer.emit('offer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('answer', (data) => {
    // Viewer sends answer back to streamer
    if (streamerSocket) streamerSocket.emit('answer', { sdp: data.sdp, from: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    // Relay ICE candidates between peers
    if (data.to === 'streamer' && streamerSocket) {
      streamerSocket.emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    } else {
      const viewer = viewerSockets.find(v => v.id === data.to);
      if (viewer) viewer.emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    }
  });

  // Viewer requests stream from streamer
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
