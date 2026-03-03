/**
 * Input validation middleware factory
 * Validates request body against a schema definition
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null) continue;

      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push(`${field} must be a string`);
      }

      if (rules.type === 'number' && typeof value !== 'number') {
        errors.push(`${field} must be a number`);
      }

      if (rules.type === 'email' && typeof value === 'string') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push(`${field} must be a valid email`);
        }
      }

      if (rules.type === 'phone' && typeof value === 'string') {
        // Saudi phone format: +966XXXXXXXXX or 05XXXXXXXX
        const phoneRegex = /^(\+966|966|05|5)\d{8,9}$/;
        if (!phoneRegex.test(value.replace(/\s/g, ''))) {
          errors.push(`${field} must be a valid Saudi phone number`);
        }
      }

      if (rules.type === 'datetime' && typeof value === 'string') {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          errors.push(`${field} must be a valid datetime`);
        }
      }

      if (rules.type === 'uuid' && typeof value === 'string') {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          errors.push(`${field} must be a valid UUID`);
        }
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }

      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }

      if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation Error',
        messages: errors,
      });
    }

    next();
  };
}

// Validation schemas
const schemas = {
  createPatient: {
    full_name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
    phone_number: { required: true, type: 'phone' },
    email: { type: 'email' },
    date_of_birth: { type: 'datetime' },
    gender: { enum: ['male', 'female'] },
    notes: { type: 'string', maxLength: 1000 },
  },

  updatePatient: {
    full_name: { type: 'string', minLength: 2, maxLength: 100 },
    phone_number: { type: 'phone' },
    email: { type: 'email' },
    date_of_birth: { type: 'datetime' },
    gender: { enum: ['male', 'female'] },
    notes: { type: 'string', maxLength: 1000 },
  },

  createAppointment: {
    patient_id: { required: true, type: 'uuid' },
    appointment_date: { required: true, type: 'datetime' },
    appointment_type: { type: 'string', maxLength: 100 },
    notes: { type: 'string', maxLength: 1000 },
    duration_minutes: { type: 'number', min: 5, max: 480 },
  },

  updateAppointment: {
    appointment_date: { type: 'datetime' },
    status: { enum: ['scheduled', 'confirmed', 'reschedule_requested', 'completed', 'no_show', 'cancelled'] },
    appointment_type: { type: 'string', maxLength: 100 },
    notes: { type: 'string', maxLength: 1000 },
    duration_minutes: { type: 'number', min: 5, max: 480 },
  },

  sendReminder: {
    appointment_id: { required: true, type: 'uuid' },
    reminder_type: { enum: ['24h', '3h', 'manual'] },
  },

  login: {
    email: { required: true, type: 'email' },
    password: { required: true, type: 'string', minLength: 6 },
  },

  register: {
    email: { required: true, type: 'email' },
    password: { required: true, type: 'string', minLength: 8 },
    full_name: { required: true, type: 'string', minLength: 2, maxLength: 100 },
    clinic_name: { required: true, type: 'string', minLength: 2, maxLength: 200 },
    clinic_phone: { type: 'phone' },
  },
};

module.exports = { validate, schemas };
