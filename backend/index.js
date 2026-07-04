const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const positionsRoute = require('./routes/positions');
const monitorRoute = require('./routes/monitor');
const authRoute = require('./routes/auth');
const virtualTradeRoute = require('./routes/virtualTrade');
const optionChainRoute = require('./routes/optionChain');
const alertsRoute = require('./routes/alerts');
const chatRoute = require('./routes/chat');
const { initWebSocket, subscribeTokens, unsubscribeTokens, onTick, onCrossover, getStatus } = require('./services/websocketFeed');
const { sendAlert, onAlert } = require('./services/notificationDispatcher');
const AlertConfig = require('./models/AlertConfig');

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
app.use('/api/alerts', alertsRoute);
app.use('/api/chat', chatRoute);

app.get('/', (req, res) => {
  res.send('Trading App Backend is running!');
});

// WebSocket feed status endpoint
app.get('/api/ws-status', (req, res) => {
  res.json({ success: true, data: getStatus() });
});

// ===== Socket.IO Setup =====
// Track socketId -> userId mapping
const socketToUser = new Map(); // socketId -> userId
// Track subscriptions per client for cleanup
const clientSubscriptions = new Map(); // socketId -> Set of tokens
// Reference count tokens across all clients
const tokenRefCount = new Map(); // token -> count

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  clientSubscriptions.set(socket.id, new Set());

  // Client identifies themselves with their auth token
  socket.on('register-user', async (data) => {
    try {
      const token = data?.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socketToUser.set(socket.id, decoded.userId);
        socket.join(decoded.userId);
        console.log(`👤 Socket ${socket.id} registered to user ${decoded.userId}`);

        // Self-healing feed: Auto-initialize websocket if not connected
        if (!getStatus().connected) {
          initWebSocket(decoded.userId).catch(e => console.log('Socket auto-init websocket failed:', e.message));
        }
      }
    } catch (err) {
      console.log('Socket user registration failed:', err.message);
    }
  });

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
      const userId = socketToUser.get(socket.id);
      await subscribeTokens(newTokens, userId);
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
    socketToUser.delete(socket.id);

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

// Bind crossover engine events from websocketFeed to notificationDispatcher
onCrossover(async (token, crossoverPayload) => {
  try {
    const userIds = new Set();
    
    // 1. Find all online users who currently watch this token on their dashboard
    for (const [socketId, tokens] of clientSubscriptions.entries()) {
      if (tokens.has(token)) {
        const userId = socketToUser.get(socketId);
        if (userId) {
          userIds.add(userId);
        }
      }
    }

    // 2. ALSO query all users who have an active background AlertConfig for this token (even if they are offline/no open tab)
    const activeConfigs = await AlertConfig.find({ token });
    activeConfigs.forEach(c => {
      userIds.add(c.userId.toString());
    });

    // 3. Dispatch the alert to each unique user
    for (const userId of userIds) {
      await sendAlert(userId, crossoverPayload);
    }
  } catch (err) {
    console.log('Error dispatching crossover to users:', err.message);
  }
});

// Bind notifications alerts back to Socket.IO live rooms
onAlert((userId, alertDoc) => {
  io.to(userId.toString()).emit('ema_crossover_alert', alertDoc);
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