const express = require('express');
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');
const { authenticateAdmin, generateAdminToken } = require('../middleware/adminAuth');

const router = express.Router();

// ========================================
// AUTH ROUTES (no middleware needed)
// ========================================

/**
 * POST /api/admin/login
 * Super admin login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and password are required',
      });
    }

    const { data: admin, error } = await supabaseAdmin
      .from('super_admins')
      .select('id, email, password_hash, full_name, is_active')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !admin) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    if (!admin.is_active) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account is deactivated',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const token = generateAdminToken(admin);

    res.json({
      message: 'Login successful',
      admin: {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
      },
      token,
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
});

/**
 * GET /api/admin/me
 * Get current admin profile
 */
router.get('/me', authenticateAdmin, async (req, res) => {
  res.json({
    admin: {
      id: req.admin.id,
      email: req.admin.email,
      full_name: req.admin.full_name,
    },
  });
});

// ========================================
// PROTECTED ROUTES (all require authenticateAdmin)
// ========================================
router.use(authenticateAdmin);

// ========================================
// CLINICS
// ========================================

/**
 * GET /api/admin/clinics
 * List all registered clinics with stats
 */
router.get('/clinics', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = supabaseAdmin
      .from('users')
      .select('id, email, full_name, clinic_id, clinic_name, clinic_phone, role, is_active, subscription_status, subscription_plan, subscription_start, subscription_end, created_at', { count: 'exact' })
      .eq('role', 'admin')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit, 10) - 1);

    if (status) {
      query = query.eq('subscription_status', status);
    }

    if (search) {
      // Sanitize search input to prevent injection into PostgREST filter
      const sanitized = search.replace(/[^a-zA-Z0-9@.\-_ ]/g, '');
      if (sanitized) {
        query = query.or(`clinic_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
      }
    }

    const { data: clinics, error, count } = await query;

    if (error) {
      console.error('List clinics error:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch clinics' });
    }

    // Get stats for each clinic
    const clinicsWithStats = await Promise.all(
      (clinics || []).map(async (clinic) => {
        const [patientCount, appointmentCount, reminderCount] = await Promise.all([
          supabaseAdmin
            .from('patients')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinic.clinic_id)
            .eq('is_deleted', false),
          supabaseAdmin
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinic.clinic_id)
            .eq('is_deleted', false),
          supabaseAdmin
            .from('reminder_logs')
            .select('*', { count: 'exact', head: true })
            .eq('clinic_id', clinic.clinic_id),
        ]);

        return {
          ...clinic,
          stats: {
            patients: patientCount.count || 0,
            appointments: appointmentCount.count || 0,
            reminders_sent: reminderCount.count || 0,
          },
        };
      })
    );

    res.json({
      clinics: clinicsWithStats,
      pagination: {
        total: count || 0,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil((count || 0) / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('List clinics error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch clinics' });
  }
});

/**
 * GET /api/admin/clinics/:clinicId
 * Get detailed clinic info
 */
router.get('/clinics/:clinicId', async (req, res) => {
  try {
    const { clinicId } = req.params;

    // Get clinic user info
    const { data: clinic, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('role', 'admin')
      .single();

    if (error || !clinic) {
      return res.status(404).json({ error: 'Not Found', message: 'Clinic not found' });
    }

    // Get patients
    const { data: patients, count: patientCount } = await supabaseAdmin
      .from('patients')
      .select('id, full_name, phone_number, email, created_at', { count: 'exact' })
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(100);

    // Get recent appointments
    const { data: appointments, count: appointmentCount } = await supabaseAdmin
      .from('appointments')
      .select('id, patient_id, appointment_date, appointment_type, status, patients(full_name)', { count: 'exact' })
      .eq('clinic_id', clinicId)
      .eq('is_deleted', false)
      .order('appointment_date', { ascending: false })
      .limit(50);

    // Get reminder stats
    const { data: reminderLogs } = await supabaseAdmin
      .from('reminder_logs')
      .select('status, reminder_type, sent_at')
      .eq('clinic_id', clinicId);

    const reminderStats = {
      total: (reminderLogs || []).length,
      sent: (reminderLogs || []).filter((r) => r.status === 'sent').length,
      failed: (reminderLogs || []).filter((r) => r.status === 'failed').length,
    };

    // Remove password_hash from response
    const { password_hash, ...clinicData } = clinic;

    res.json({
      clinic: clinicData,
      patients: { data: patients || [], total: patientCount || 0 },
      appointments: { data: appointments || [], total: appointmentCount || 0 },
      reminderStats,
    });
  } catch (err) {
    console.error('Get clinic detail error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch clinic details' });
  }
});

/**
 * PUT /api/admin/clinics/:clinicId/status
 * Update clinic subscription status (activate/deactivate)
 */
router.put('/clinics/:clinicId/status', async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { subscription_status, is_active } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (subscription_status) updateData.subscription_status = subscription_status;
    if (typeof is_active === 'boolean') updateData.is_active = is_active;

    // Update only the admin user for this clinic (not staff/viewer users)
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('clinic_id', clinicId)
      .eq('role', 'admin')
      .select('id, clinic_name, subscription_status, is_active')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update clinic' });
    }

    res.json({ message: 'Clinic updated', clinic: data });
  } catch (err) {
    console.error('Update clinic status error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update clinic' });
  }
});

// ========================================
// SYSTEM ANALYTICS
// ========================================

/**
 * GET /api/admin/analytics
 * Get system-wide analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    // Total clinics
    const { count: totalClinics } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');

    // Active clinics (trialing or active subscription)
    const { count: activeClinics } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
      .in('subscription_status', ['trialing', 'active']);

    // Total patients across all clinics
    const { count: totalPatients } = await supabaseAdmin
      .from('patients')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    // Total appointments
    const { count: totalAppointments } = await supabaseAdmin
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    // Total reminders sent
    const { count: totalReminders } = await supabaseAdmin
      .from('reminder_logs')
      .select('*', { count: 'exact', head: true });

    // Successful reminders
    const { count: successfulReminders } = await supabaseAdmin
      .from('reminder_logs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent');

    // Subscription breakdown
    const subscriptionStatuses = ['trialing', 'active', 'inactive', 'expired', 'cancelled'];
    const subscriptionBreakdown = {};
    for (const status of subscriptionStatuses) {
      const { count } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('subscription_status', status);
      subscriptionBreakdown[status] = count || 0;
    }

    // Appointment status breakdown
    const appointmentStatuses = ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];
    const appointmentBreakdown = {};
    for (const status of appointmentStatuses) {
      const { count } = await supabaseAdmin
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
        .eq('is_deleted', false);
      appointmentBreakdown[status] = count || 0;
    }

    // Recent signups (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentSignups } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
      .gte('created_at', thirtyDaysAgo);

    // Inbound messages count
    const { count: totalInboundMessages } = await supabaseAdmin
      .from('inbound_messages')
      .select('*', { count: 'exact', head: true });

    res.json({
      analytics: {
        overview: {
          totalClinics: totalClinics || 0,
          activeClinics: activeClinics || 0,
          totalPatients: totalPatients || 0,
          totalAppointments: totalAppointments || 0,
          totalReminders: totalReminders || 0,
          successfulReminders: successfulReminders || 0,
          deliveryRate: totalReminders > 0 ? Math.round(((successfulReminders || 0) / totalReminders) * 100) : 0,
          totalInboundMessages: totalInboundMessages || 0,
          recentSignups: recentSignups || 0,
        },
        subscriptionBreakdown,
        appointmentBreakdown,
      },
    });
  } catch (err) {
    console.error('System analytics error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/admin/recent-activity
 * Get recent platform activity
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const { limit = 30 } = req.query;

    // Recent clinic signups
    const { data: recentClinics } = await supabaseAdmin
      .from('users')
      .select('id, email, clinic_name, subscription_status, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit, 10));

    // Recent reminders
    const { data: recentReminders } = await supabaseAdmin
      .from('reminder_logs')
      .select('id, clinic_id, status, reminder_type, sent_at')
      .order('sent_at', { ascending: false })
      .limit(parseInt(limit, 10));

    // Recent inbound messages
    const { data: recentMessages } = await supabaseAdmin
      .from('inbound_messages')
      .select('id, clinic_id, from_phone, action, message_content, received_at')
      .order('received_at', { ascending: false })
      .limit(parseInt(limit, 10));

    res.json({
      recentClinics: recentClinics || [],
      recentReminders: recentReminders || [],
      recentMessages: recentMessages || [],
    });
  } catch (err) {
    console.error('Recent activity error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch recent activity' });
  }
});

module.exports = router;
