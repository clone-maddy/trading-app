const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const positionsRoute = require('./routes/positions');
const monitorRoute = require('./routes/monitor');
const authRoute = require('./routes/auth');
const virtualTradeRoute = require('./routes/virtualTrade');
const optionChainRoute = require('./routes/optionChain');
const { initWebSocket, subscribeTokens, unsubscribeTokens, onTick, getStatus } = require('./services/websocketFeed');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch((err) => console.log('MongoDB connection error:', err));

// Routes
app.use('/api/positions', positionsRoute);
app.use('/api/monitor', monitorRoute);
app.use('/api/auth', authRoute);
app.use('/api/virtual', virtualTradeRoute);
app.use('/api/options', optionChainRoute);

app.get('/', (req, res) => {
  res.send('Trading App Backend is running!');
});

// WebSocket feed status endpoint
app.get('/api/ws-status', (req, res) => {
  res.json({ success: true, data: getStatus() });
});

// ===== Socket.IO Setup =====
// Track subscriptions per client for cleanup
const clientSubscriptions = new Map(); // socketId -> Set of tokens
// Reference count tokens across all clients
const tokenRefCount = new Map(); // token -> count

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  clientSubscriptions.set(socket.id, new Set());

  // Client wants to subscribe to tokens (when option chain loads)
  socket.on('subscribe-tokens', async (data) => {
    const tokens = data?.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) return;

    const clientTokens = clientSubscriptions.get(socket.id);
    const newTokens = []; // Tokens that need to be subscribed on AngelOne

    tokens.forEach(token => {
      clientTokens.add(token);
      const count = tokenRefCount.get(token) || 0;
      tokenRefCount.set(token, count + 1);
      // Only subscribe on AngelOne if this is the first client wanting this token
      if (count === 0) {
        newTokens.push(token);
      }
    });

    if (newTokens.length > 0) {
      await subscribeTokens(newTokens);
    }

    console.log(`📡 Client ${socket.id} subscribed to ${tokens.length} tokens`);
  });

  // Client wants to unsubscribe (switching index/expiry)
  socket.on('unsubscribe-tokens', async (data) => {
    const tokens = data?.tokens;
    if (!Array.isArray(tokens) || tokens.length === 0) return;

    const clientTokens = clientSubscriptions.get(socket.id);
    const tokensToRemove = [];

    tokens.forEach(token => {
      clientTokens.delete(token);
      const count = tokenRefCount.get(token) || 0;
      if (count <= 1) {
        tokenRefCount.delete(token);
        tokensToRemove.push(token);
      } else {
        tokenRefCount.set(token, count - 1);
      }
    });

    if (tokensToRemove.length > 0) {
      await unsubscribeTokens(tokensToRemove);
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', async () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    const clientTokens = clientSubscriptions.get(socket.id) || new Set();
    const tokensToRemove = [];

    clientTokens.forEach(token => {
      const count = tokenRefCount.get(token) || 0;
      if (count <= 1) {
        tokenRefCount.delete(token);
        tokensToRemove.push(token);
      } else {
        tokenRefCount.set(token, count - 1);
      }
    });

    clientSubscriptions.delete(socket.id);

    if (tokensToRemove.length > 0) {
      await unsubscribeTokens(tokensToRemove);
    }
  });
});

// Forward AngelOne ticks to all Socket.IO clients
onTick((tickData) => {
  io.emit('price-update', tickData);
});

// Forward P&L monitor updates in real-time
const { onMonitorUpdate } = require('./services/pnlMonitor');
onMonitorUpdate((updateData) => {
  io.emit('monitor-update', updateData);
});

// ===== Start Server =====
server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Initialize AngelOne WebSocket connection
  try {
    await initWebSocket();
  } catch (err) {
    console.log('WebSocket init failed (will retry):', err.message);
  }
});