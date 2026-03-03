const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../config/supabase');
const { generateToken, authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new clinic + admin user
 */
router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const { email, password, full_name, clinic_name, clinic_phone } = req.body;

    // Check if email already exists
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email already registered',
      });
    }

    // Generate clinic ID for multi-tenancy
    const clinicId = uuidv4();

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        full_name,
        clinic_id: clinicId,
        clinic_name,
        clinic_phone: clinic_phone || null,
        role: 'admin',
        is_active: true,
        subscription_status: 'trialing',
        subscription_plan: 'trial',
        subscription_start: new Date().toISOString(),
        subscription_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14-day trial
      })
      .select('id, email, full_name, clinic_id, clinic_name, role, subscription_status')
      .single();

    if (error) {
      console.error('Registration error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create account',
      });
    }

    const token = generateToken(user);

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        clinic_id: user.clinic_id,
        clinic_name: user.clinic_name,
        role: user.role,
        subscription_status: user.subscription_status,
      },
      token,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Registration failed',
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, password_hash, full_name, clinic_id, clinic_name, role, is_active, subscription_status')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account is deactivated',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        clinic_id: user.clinic_id,
        clinic_name: user.clinic_name,
        role: user.role,
        subscription_status: user.subscription_status,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.full_name,
      clinic_id: req.user.clinic_id,
      role: req.user.role,
      subscription_status: req.user.subscription_status,
    },
  });
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Current password and new password are required',
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'New password must be at least 8 characters',
      });
    }

    // Fetch current password hash
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();

    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Current password is incorrect',
      });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await supabaseAdmin
      .from('users')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change password',
    });
  }
});

module.exports = router;
