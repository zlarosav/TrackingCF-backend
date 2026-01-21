require('dotenv').config();
const express = require('express');
const cors = require('cors');
const usersRouter = require('./routes/users');
const submissionsRouter = require('./routes/submissions');
require('./jobs/cronTracker'); // Iniciar cron job

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS para desarrollo y producción
const allowedOrigins = [
  'http://localhost:3000',
  'https://zlarosav.github.io',
  'https://tracking-cf-frontend.vercel.app',
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

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/users', usersRouter);
app.use('/api/submissions', submissionsRouter);

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
