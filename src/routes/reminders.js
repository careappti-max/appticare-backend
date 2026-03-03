const express = require('express');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const reminderService = require('../services/reminder');
const { getTenantClient } = require('../config/supabase');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/sendReminder
 * Manually send a reminder for a specific appointment
 * Requires active subscription
 */
router.post('/send', requireActiveSubscription, validate(schemas.sendReminder), async (req, res) => {
  try {
    const { appointment_id, reminder_type = 'manual' } = req.body;

    const result = await reminderService.sendReminder(req.clinicId, appointment_id, reminder_type);

    if (!result.success) {
      return res.status(400).json({
        error: 'Reminder Failed',
        message: result.error,
      });
    }

    res.json({
      message: 'Reminder sent successfully',
      messageId: result.messageId,
    });
  } catch (err) {
    console.error('Send reminder error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to send reminder' });
  }
});

/**
 * GET /api/reminders/logs
 * Get reminder logs for the clinic
 */
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, appointment_id } = req.query;
    const tenant = getTenantClient(req.clinicId);

    const { data, error, count } = await tenant.getReminderLogs({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      appointmentId: appointment_id,
    });

    if (error) {
      console.error('Get reminder logs error:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch logs' });
    }

    res.json({
      logs: data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: count,
        pages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('Get reminder logs error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch logs' });
  }
});

module.exports = router;
