const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const { supabaseAdmin } = require('../config/supabase');

/**
 * JWT Authentication Middleware
 * Verifies the JWT token and attaches user/clinic info to the request
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token has expired',
        });
      }
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    // Fetch user from database to ensure they still exist and are active
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, clinic_id, role, is_active, subscription_status')
      .eq('id', decoded.userId)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found or inactive',
      });
    }

    // Attach user and clinic context to request
    req.user = user;
    req.clinicId = user.clinic_id;

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Subscription validation middleware
 * Ensures the clinic has an active subscription before allowing reminder operations
 */
async function requireActiveSubscription(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (req.user.subscription_status !== 'active' && req.user.subscription_status !== 'trialing') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Active subscription required to use this feature',
      });
    }

    next();
  } catch (err) {
    console.error('Subscription check error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Subscription validation failed',
    });
  }
}

/**
 * Role-based access control middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }

    next();
  };
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      clinicId: user.clinic_id,
      role: user.role,
      email: user.email,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = {
  authenticate,
  requireActiveSubscription,
  requireRole,
  generateToken,
};
