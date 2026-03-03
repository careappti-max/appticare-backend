const express = require('express');
const { getTenantClient } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/appointments
 * List appointments for the authenticated clinic
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, status, date_from, date_to, patient_id } = req.query;
    const tenant = getTenantClient(req.clinicId);

    const { data, error, count } = await tenant.getAppointments({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      dateFrom: date_from,
      dateTo: date_to,
      patientId: patient_id,
    });

    if (error) {
      console.error('Get appointments error:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch appointments' });
    }

    res.json({
      appointments: data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: count,
        pages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('Get appointments error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch appointments' });
  }
});

/**
 * GET /api/appointments/:id
 * Get a single appointment by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { data, error } = await tenant.getAppointmentById(req.params.id);

    if (error || !data) {
      return res.status(404).json({ error: 'Not Found', message: 'Appointment not found' });
    }

    res.json({ appointment: data });
  } catch (err) {
    console.error('Get appointment error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch appointment' });
  }
});

/**
 * POST /api/appointments
 * Create a new appointment
 */
router.post('/', validate(schemas.createAppointment), async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { patient_id, appointment_date, appointment_type, notes, duration_minutes } = req.body;

    // Verify patient belongs to clinic
    const { data: patient, error: patientError } = await tenant.getPatientById(patient_id);
    if (patientError || !patient) {
      return res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
    }

    // Validate appointment date is in the future
    if (new Date(appointment_date) <= new Date()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Appointment date must be in the future',
      });
    }

    const { data, error } = await tenant.createAppointment({
      patient_id,
      appointment_date,
      appointment_type: appointment_type || 'general',
      notes: notes || null,
      duration_minutes: duration_minutes || 30,
      status: 'scheduled',
      reminder_24h_sent: false,
      reminder_3h_sent: false,
    });

    if (error) {
      console.error('Create appointment error:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create appointment' });
    }

    res.status(201).json({ appointment: data });
  } catch (err) {
    console.error('Create appointment error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create appointment' });
  }
});

/**
 * PUT /api/appointments/:id
 * Update an appointment
 */
router.put('/:id', validate(schemas.updateAppointment), async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { appointment_date, status, appointment_type, notes, duration_minutes } = req.body;

    const updateData = {};
    if (appointment_date !== undefined) updateData.appointment_date = appointment_date;
    if (status !== undefined) updateData.status = status;
    if (appointment_type !== undefined) updateData.appointment_type = appointment_type;
    if (notes !== undefined) updateData.notes = notes;
    if (duration_minutes !== undefined) updateData.duration_minutes = duration_minutes;
    updateData.updated_at = new Date().toISOString();

    // If rescheduling, reset reminder flags
    if (appointment_date !== undefined) {
      updateData.reminder_24h_sent = false;
      updateData.reminder_3h_sent = false;
    }

    const { data, error } = await tenant.updateAppointment(req.params.id, updateData);

    if (error || !data) {
      return res.status(404).json({ error: 'Not Found', message: 'Appointment not found' });
    }

    res.json({ appointment: data });
  } catch (err) {
    console.error('Update appointment error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update appointment' });
  }
});

/**
 * DELETE /api/appointments/:id
 * Soft delete an appointment
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { error } = await tenant.deleteAppointment(req.params.id);

    if (error) {
      return res.status(404).json({ error: 'Not Found', message: 'Appointment not found' });
    }

    res.json({ message: 'Appointment deleted successfully' });
  } catch (err) {
    console.error('Delete appointment error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete appointment' });
  }
});

module.exports = router;
