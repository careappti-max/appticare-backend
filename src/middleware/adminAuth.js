const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Super Admin JWT Authentication Middleware
 * Verifies token and checks super_admins table
 */
async function authenticateAdmin(req, res, next) {
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

    // Must be a super_admin token
    if (decoded.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Super admin access required',
      });
    }

    // Verify admin exists and is active
    const { data: admin, error } = await supabaseAdmin
      .from('super_admins')
      .select('id, email, full_name, is_active')
      .eq('id', decoded.adminId)
      .eq('is_active', true)
      .single();

    if (error || !admin) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Admin not found or inactive',
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error('Admin auth middleware error:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Generate JWT token for a super admin
 */
function generateAdminToken(admin) {
  return jwt.sign(
    {
      adminId: admin.id,
      role: 'super_admin',
      email: admin.email,
    },
    config.jwt.secret,
    { expiresIn: '24h' }
  );
}

module.exports = {
  authenticateAdmin,
  generateAdminToken,
};
