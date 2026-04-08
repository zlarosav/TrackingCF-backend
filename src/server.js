require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const usersRouter = require('./routes/users');
const submissionsRouter = require('./routes/submissions');
const contestsRouter = require('./routes/contests');
require('./jobs/cronTracker'); // Iniciar cron job de tracking
require('./jobs/cronStreakReset'); // Iniciar cron job de reset de rachas
require('./jobs/cronContests'); // Iniciar cron job de contests globales
require('./jobs/cronUserRatings'); // Iniciar cron job de user ratings

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS para desarrollo y producción
const allowedOrigins = [
  'http://localhost:3000',
  'https://tracking-cf-frontend.vercel.app',
  'https://trackingcf.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (como Postman, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware with status and timing
const REDACT_KEYS = new Set(['password', 'token', 'authorization', 'jwt', 'secret', 'apiKey']);

function sanitizeForLog(value) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }

  if (typeof value === 'object') {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = REDACT_KEYS.has(key) ? '[REDACTED]' : sanitizeForLog(val);
    }
    return output;
  }

  return value;
}

function getStatusTag(status) {
  if (status >= 500) return 'ERR';
  if (status >= 400) return 'WARN';
  if (status >= 300) return 'REDIR';
  return 'OK';
}

app.use((req, res, next) => {
  const requestId = randomUUID().slice(0, 8);
  const start = process.hrtime.bigint();
  const startedAt = new Date().toISOString();

  const safeQuery = sanitizeForLog(req.query);
  const safeBody = sanitizeForLog(req.body);
  const bodyPreview = req.method === 'GET' || req.method === 'HEAD' ? '' : ` body=${JSON.stringify(safeBody)}`;
  const queryPreview = Object.keys(safeQuery || {}).length ? ` query=${JSON.stringify(safeQuery)}` : '';

  console.log(`[REQ ${requestId}] ${startedAt} ${req.method} ${req.originalUrl} ip=${req.ip}${queryPreview}${bodyPreview}`);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const status = res.statusCode;
    const statusTag = getStatusTag(status);
    const contentLength = res.getHeader('content-length') || '-';

    console.log(
      `[RES ${requestId}] ${statusTag} ${status} ${req.method} ${req.originalUrl} ${durationMs.toFixed(1)}ms bytes=${contentLength}`
    );
  });

  next();
});

// Routes
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./middleware/audit'), usersRouter); // Audit public user requests? Or all? User requested audit (no login).
// Re-reading request: "Trackeo de IPs y auditoría de sesiones de usuarios (sin login de usuarios, por eso por IP)."
// This means we should probably audit ALL traffic or key endpoints.
// Let's audit everything for now, or at least the API routes.

// Global Audit Middleware (applied to all /api routes)
const auditMiddleware = require('./middleware/audit');
app.use('/api', auditMiddleware);

app.use('/api/users', usersRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/contests', contestsRouter);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat')); // Chatbot routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'TrackingCF API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Timezone: ${process.env.TZ || 'UTC'}`);
});

module.exports = app;
