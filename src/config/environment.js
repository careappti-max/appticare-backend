const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // WhatsApp Cloud API
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  },

  // Moyasar
  moyasar: {
    secretKey: process.env.MOYASAR_SECRET_KEY,
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY,
    webhookSecret: process.env.MOYASAR_WEBHOOK_SECRET,
  },

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'],

  // App
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Riyadh',
};

// Validate required config in production
function validateConfig() {
  const required = [
    'supabase.url',
    'supabase.serviceRoleKey',
    'jwt.secret',
  ];

  const missing = [];
  for (const key of required) {
    const parts = key.split('.');
    let val = config;
    for (const p of parts) {
      val = val?.[p];
    }
    if (!val) {
      missing.push(key);
    }
  }

  if (missing.length > 0 && config.nodeEnv === 'production') {
    console.error(`Missing required config: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (missing.length > 0) {
    console.warn(`Warning: Missing config keys: ${missing.join(', ')}`);
  }
}

validateConfig();

module.exports = config;
