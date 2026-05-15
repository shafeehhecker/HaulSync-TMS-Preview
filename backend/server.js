require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const morgan    = require('morgan');
const http      = require('http');
const { Server }= require('socket.io');
const path      = require('path');
const jwt       = require('jsonwebtoken');

const { errorHandler } = require('./src/middleware/errorHandler');
const hosEngine        = require('./src/engines/hosEngine');

// Routes
const authRouter      = require('./src/routes/auth');
const loadsRouter     = require('./src/routes/loads');
const documentsRouter = require('./src/routes/documents');
const fleetRouter     = require('./src/routes/fleet');
const hosRouter       = require('./src/routes/hos');
const analyticsRouter = require('./src/routes/analytics');
const usersRouter     = require('./src/routes/users');

const app    = express();
const server = http.createServer(app);

// ── CORS ──────────────────────────────────────────────────────────────────────
const rawOrigins    = process.env.FRONTEND_URL || 'http://localhost:3004';
const allowedOrigins = rawOrigins.split(',').map(o => o.trim());

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
};

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'], credentials: true },
});

// Auth socket connections with JWT
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`📡 Client connected: ${socket.id}`);

  // Join role-based room for targeted dispatch alerts
  if (socket.user?.role) socket.join(`role:${socket.user.role}`);

  // Load-specific room subscription
  socket.on('join_load',  (loadId) => socket.join(`load_${loadId}`));
  socket.on('leave_load', (loadId) => socket.leave(`load_${loadId}`));

  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'HaulSync TMS Dispatch API', version: '1.0.0' })
);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRouter);
app.use('/api/loads',     loadsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/fleet',     fleetRouter);
app.use('/api/hos',       hosRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/users',     usersRouter);

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Bootstrap engines ─────────────────────────────────────────────────────────
hosEngine.setSocketIO(io);
hosEngine.startPolling();

const PORT = process.env.PORT || 5004;
server.listen(PORT, () => {
  console.log(`\n⚡ HaulSync TMS Dispatch API  →  http://localhost:${PORT}`);
  console.log(`📖 Health check              →  http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket                 →  ws://localhost:${PORT}\n`);
});

module.exports = { app, io };
