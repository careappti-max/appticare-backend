const express = require('express');
const { getTenantClient } = require('../config/supabase');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/patients
 * List patients for the authenticated clinic
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const tenant = getTenantClient(req.clinicId);

    const { data, error, count } = await tenant.getPatients({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
    });

    if (error) {
      console.error('Get patients error:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch patients' });
    }

    res.json({
      patients: data,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: count,
        pages: Math.ceil(count / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('Get patients error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch patients' });
  }
});

/**
 * GET /api/patients/:id
 * Get a single patient by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { data, error } = await tenant.getPatientById(req.params.id);

    if (error || !data) {
      return res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
    }

    res.json({ patient: data });
  } catch (err) {
    console.error('Get patient error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch patient' });
  }
});

/**
 * POST /api/patients
 * Create a new patient
 */
router.post('/', validate(schemas.createPatient), async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { full_name, phone_number, email, date_of_birth, gender, notes } = req.body;

    const { data, error } = await tenant.createPatient({
      full_name,
      phone_number,
      email: email || null,
      date_of_birth: date_of_birth || null,
      gender: gender || null,
      notes: notes || null,
    });

    if (error) {
      console.error('Create patient error:', error);
      return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create patient' });
    }

    res.status(201).json({ patient: data });
  } catch (err) {
    console.error('Create patient error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create patient' });
  }
});

/**
 * PUT /api/patients/:id
 * Update a patient
 */
router.put('/:id', validate(schemas.updatePatient), async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { full_name, phone_number, email, date_of_birth, gender, notes } = req.body;

    const updateData = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (phone_number !== undefined) updateData.phone_number = phone_number;
    if (email !== undefined) updateData.email = email;
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;
    if (gender !== undefined) updateData.gender = gender;
    if (notes !== undefined) updateData.notes = notes;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await tenant.updatePatient(req.params.id, updateData);

    if (error || !data) {
      return res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
    }

    res.json({ patient: data });
  } catch (err) {
    console.error('Update patient error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update patient' });
  }
});

/**
 * DELETE /api/patients/:id
 * Soft delete a patient
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenant = getTenantClient(req.clinicId);
    const { error } = await tenant.deletePatient(req.params.id);

    if (error) {
      return res.status(404).json({ error: 'Not Found', message: 'Patient not found' });
    }

    res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    console.error('Delete patient error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete patient' });
  }
});

module.exports = router;
