const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config/environment');

// Import routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const appointmentRoutes = require('./routes/appointments');
const reminderRoutes = require('./routes/reminders');
const webhookRoutes = require('./routes/webhooks');
const analyticsRoutes = require('./routes/analytics');
const billingRoutes = require('./routes/billing');
const adminRoutes = require('./routes/admin');

// Import scheduler
const scheduler = require('./jobs/scheduler');

const app = express();

// ===================
// Security Middleware
// ===================

// Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // Allow configured origins
      if (config.allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
        return callback(null, true);
      }

      // Allow appticare.com, admin.appticare.com and appticare.netlify.app
      if (origin === 'https://appticare.com' || origin === 'http://appticare.com' || origin === 'https://www.appticare.com' || origin === 'https://admin.appticare.com' || origin === 'https://appticare.netlify.app' || origin === 'https://appticare-admin.netlify.app') {
        return callback(null, true);
      }

      // Allow devinapps.com subdomains (deployed frontends)
      if (origin.match(/^https:\/\/.*\.devinapps\.com$/)) {
        return callback(null, true);
      }

      // Allow Bubble.io subdomains and Netlify subdomains
      if (origin.match(/^https:\/\/.*\.bubbleapps\.io$/) || origin.match(/^https:\/\/.*\.bubble\.io$/) || origin.match(/^https:\/\/.*\.netlify\.app$/)) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // stricter limit for auth endpoints
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts. Please try again later.',
  },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200, // higher limit for webhooks
});

// ===================
// Body Parsing
// ===================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===================
// Logging
// ===================
if (config.nodeEnv === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// ===================
// Health Check
// ===================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ApptiCare API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// ===================
// API Routes
// ===================
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/patients', apiLimiter, patientRoutes);
app.use('/api/appointments', apiLimiter, appointmentRoutes);
app.use('/api/reminders', apiLimiter, reminderRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);
app.use('/api/billing', apiLimiter, billingRoutes);
// Admin routes use authLimiter for login brute-force protection
app.use('/api/admin/login', authLimiter);
app.use('/api/admin', apiLimiter, adminRoutes);

// Legacy endpoint alias
app.post('/api/sendReminder', apiLimiter, require('./middleware/auth').authenticate, require('./middleware/auth').requireActiveSubscription, async (req, res) => {
  const reminderService = require('./services/reminder');
  try {
    const { appointment_id, reminder_type = 'manual' } = req.body;
    if (!appointment_id) {
      return res.status(400).json({ error: 'Validation Error', message: 'appointment_id is required' });
    }
    const result = await reminderService.sendReminder(req.clinicId, appointment_id, reminder_type);
    if (!result.success) {
      return res.status(400).json({ error: 'Reminder Failed', message: result.error });
    }
    res.json({ message: 'Reminder sent successfully', messageId: result.messageId });
  } catch (err) {
    console.error('Send reminder error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send reminder' });
  }
});

// ===================
// Webhook Routes (no auth required, verified by signature/token)
// ===================
app.use('/webhooks', webhookLimiter, webhookRoutes);

// ===================
// 404 Handler
// ===================
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// ===================
// Global Error Handler
// ===================
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'CORS policy violation',
    });
  }

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: config.nodeEnv === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// ===================
// Start Server
// ===================
function startServer() {
  const port = config.port;

  app.listen(port, '0.0.0.0', () => {
    console.log(`\n🏥 ApptiCare API Server`);
    console.log(`   Environment: ${config.nodeEnv}`);
    console.log(`   Port: ${port}`);
    console.log(`   CORS Origins: ${config.allowedOrigins.join(', ')}`);
    console.log(`   Timezone: ${config.defaultTimezone}`);
    console.log('');

    // Start the scheduler for automated reminders
    scheduler.start();
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  scheduler.stop();
  process.exit(0);
});

module.exports = { app, startServer };
