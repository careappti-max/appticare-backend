# ApptiCare API Reference

**Base URL:** `https://appticare-api-production.up.railway.app`

---

## Authentication

All authenticated endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Tokens expire after 24 hours. Obtain a token via `/api/auth/login`.

---

## 1. Auth Endpoints

### POST /api/auth/register

Register a new clinic and admin user. Each registration creates a new tenant (clinic).

**Body:**
```json
{
  "email": "admin@myclinic.com",
  "password": "SecurePass123!",
  "full_name": "Dr. Ahmed",
  "clinic_name": "Smile Dental Clinic",
  "clinic_phone": "+966501234567"
}
```

**Response (201):**
```json
{
  "message": "Registration successful",
  "user": {
    "id": "uuid",
    "email": "admin@myclinic.com",
    "full_name": "Dr. Ahmed",
    "clinic_id": "uuid",
    "clinic_name": "Smile Dental Clinic",
    "role": "admin",
    "subscription_status": "trialing"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Notes:**
- New accounts start with a 14-day trial (`subscription_status: "trialing"`)
- `clinic_phone` is optional
- Email must be unique across all tenants

---

### POST /api/auth/login

Authenticate and receive a JWT token.

**Body:**
```json
{
  "email": "admin@myclinic.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "admin@myclinic.com",
    "full_name": "Dr. Ahmed",
    "clinic_id": "uuid",
    "clinic_name": "Smile Dental Clinic",
    "role": "admin",
    "subscription_status": "active"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### GET /api/auth/me

Get current user profile. **Requires auth.**

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "admin@myclinic.com",
    "full_name": "Dr. Ahmed",
    "clinic_id": "uuid",
    "role": "admin",
    "subscription_status": "active"
  }
}
```

---

### POST /api/auth/change-password

Change password. **Requires auth.**

**Body:**
```json
{
  "current_password": "OldPass123!",
  "new_password": "NewPass456!"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

---

## 2. Patient Endpoints

All patient endpoints require authentication. Data is automatically scoped to the authenticated user's clinic (multi-tenant isolation).

### GET /api/patients

List patients with pagination and search.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 50 | Results per page |
| search | string | - | Search by name or phone |

**Response (200):**
```json
{
  "patients": [
    {
      "id": "uuid",
      "full_name": "Mohammed Ali",
      "phone_number": "+966501234567",
      "email": "patient@email.com",
      "date_of_birth": "1990-01-15",
      "gender": "male",
      "notes": "Allergic to penicillin",
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "pages": 3
  }
}
```

---

### GET /api/patients/:id

Get a single patient by ID.

**Response (200):**
```json
{
  "patient": {
    "id": "uuid",
    "full_name": "Mohammed Ali",
    "phone_number": "+966501234567",
    "email": "patient@email.com",
    "date_of_birth": "1990-01-15",
    "gender": "male",
    "notes": "Allergic to penicillin"
  }
}
```

---

### POST /api/patients

Create a new patient.

**Body:**
```json
{
  "full_name": "Mohammed Ali",
  "phone_number": "+966501234567",
  "email": "patient@email.com",
  "date_of_birth": "1990-01-15",
  "gender": "male",
  "notes": "Allergic to penicillin"
}
```

**Required fields:** `full_name`, `phone_number`
**Optional fields:** `email`, `date_of_birth`, `gender`, `notes`

**Response (201):**
```json
{
  "patient": { ... }
}
```

---

### PUT /api/patients/:id

Update a patient. Only include fields you want to change.

**Body (partial update):**
```json
{
  "phone_number": "+966509876543",
  "notes": "Updated notes"
}
```

**Response (200):**
```json
{
  "patient": { ... }
}
```

---

### DELETE /api/patients/:id

Soft-delete a patient (sets `is_deleted = true`).

**Response (200):**
```json
{
  "message": "Patient deleted successfully"
}
```

---

## 3. Appointment Endpoints

All appointment endpoints require authentication. Multi-tenant isolation is automatic.

### GET /api/appointments

List appointments with filtering and pagination.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 50 | Results per page |
| status | string | - | Filter: scheduled, confirmed, completed, no_show, cancelled, reschedule_requested |
| date_from | ISO date | - | Filter from date |
| date_to | ISO date | - | Filter to date |
| patient_id | uuid | - | Filter by patient |

**Response (200):**
```json
{
  "appointments": [
    {
      "id": "uuid",
      "patient_id": "uuid",
      "appointment_date": "2025-03-15T10:00:00.000Z",
      "appointment_type": "cleaning",
      "status": "scheduled",
      "duration_minutes": 30,
      "notes": "Regular cleaning",
      "reminder_24h_sent": false,
      "reminder_3h_sent": false,
      "created_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { ... }
}
```

---

### GET /api/appointments/:id

Get a single appointment by ID.

---

### POST /api/appointments

Create a new appointment.

**Body:**
```json
{
  "patient_id": "uuid",
  "appointment_date": "2025-03-15T10:00:00.000Z",
  "appointment_type": "cleaning",
  "notes": "Regular cleaning",
  "duration_minutes": 30
}
```

**Required fields:** `patient_id`, `appointment_date`
**Optional fields:** `appointment_type` (default: "general"), `notes`, `duration_minutes` (default: 30)

**Validation:**
- `patient_id` must belong to the same clinic
- `appointment_date` must be in the future

**Response (201):**
```json
{
  "appointment": { ... }
}
```

---

### PUT /api/appointments/:id

Update an appointment. If `appointment_date` is changed, reminder flags are automatically reset.

**Body (partial update):**
```json
{
  "appointment_date": "2025-03-16T14:00:00.000Z",
  "status": "confirmed"
}
```

**Valid statuses:** `scheduled`, `confirmed`, `completed`, `no_show`, `cancelled`, `reschedule_requested`

---

### DELETE /api/appointments/:id

Soft-delete an appointment.

---

## 4. Reminder Endpoints

### POST /api/reminders/send

Manually send a WhatsApp reminder for a specific appointment. **Requires active subscription** (status = `active` or `trialing`).

**Body:**
```json
{
  "appointment_id": "uuid",
  "reminder_type": "manual"
}
```

**Response (200):**
```json
{
  "message": "Reminder sent successfully",
  "messageId": "wamid.xxx"
}
```

---

### GET /api/reminders/logs

Get reminder sending history.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| limit | int | 50 | Results per page |
| appointment_id | uuid | - | Filter by appointment |

**Response (200):**
```json
{
  "logs": [
    {
      "id": "uuid",
      "appointment_id": "uuid",
      "patient_id": "uuid",
      "reminder_type": "24h",
      "status": "sent",
      "whatsapp_message_id": "wamid.xxx",
      "sent_at": "2025-03-14T10:00:00.000Z"
    }
  ],
  "pagination": { ... }
}
```

---

## 5. Analytics Endpoints

### GET /api/analytics/dashboard

Get comprehensive dashboard statistics.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| date_from | ISO date | Start date filter |
| date_to | ISO date | End date filter |

**Response (200):**
```json
{
  "analytics": {
    "totalAppointments": 150,
    "confirmedAppointments": 120,
    "noShows": 10,
    "attendanceRate": 92.3,
    "confirmationRate": 80.0,
    "totalPatients": 85,
    "upcomingAppointments": 25,
    "todayAppointments": 8
  }
}
```

---

### GET /api/analytics/no-shows

Get monthly no-show trends.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| months | int | 6 | Number of months to analyze |

**Response (200):**
```json
{
  "noShowTrends": [
    { "month": "2025-01", "count": 3, "rate": 5.2 },
    { "month": "2025-02", "count": 2, "rate": 3.8 }
  ]
}
```

---

### GET /api/analytics/frequent-no-shows

Get patients with frequent no-shows.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| min_no_shows | int | 2 | Minimum no-shows threshold |

**Response (200):**
```json
{
  "frequentNoShows": [
    {
      "patient_id": "uuid",
      "full_name": "Patient Name",
      "phone_number": "+966...",
      "no_show_count": 5
    }
  ]
}
```

---

## 6. Billing Endpoints

### GET /api/billing/plans

Get available subscription plans (no auth required beyond JWT).

**Response (200):**
```json
{
  "plans": {
    "monthly": {
      "name": "Monthly",
      "price": 299,
      "description": "ApptiCare Monthly Subscription"
    },
    "yearly": {
      "name": "Yearly",
      "price": 2990,
      "description": "ApptiCare Yearly Subscription (Save 17%)"
    }
  }
}
```

---

### GET /api/billing/subscription

Get current subscription status.

**Response (200):**
```json
{
  "subscription": {
    "status": "active",
    "plan": "monthly",
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-02-01T00:00:00.000Z",
    "isActive": true
  }
}
```

**Possible statuses:** `trialing`, `active`, `expired`, `cancelled`

---

### POST /api/billing/create-session

Create a Moyasar payment session.

**Body:**
```json
{
  "plan_type": "monthly"
}
```

**Response (200):**
```json
{
  "paymentUrl": "https://api.moyasar.com/v1/payments/...",
  "invoiceId": "inv_xxx",
  "plan": {
    "type": "monthly",
    "name": "Monthly",
    "price": 299,
    "currency": "SAR"
  }
}
```

---

### GET /api/billing/history

Get payment history.

**Response (200):**
```json
{
  "payments": [...],
  "pagination": { ... }
}
```

---

## 7. Webhook Endpoints

These are called by external services (Meta/Moyasar), not by Bubble.

### GET /webhooks/whatsapp

WhatsApp webhook verification (called by Meta during setup).

### POST /webhooks/whatsapp

Receives incoming WhatsApp messages. Processes patient replies:
- **Reply "1"** or button "Confirm" -> Sets appointment status to `confirmed`
- **Reply "2"** or button "Reschedule" -> Sets appointment status to `reschedule_requested`

### POST /webhooks/moyasar

Receives Moyasar payment webhooks. On successful payment:
- Activates subscription
- Sets subscription period based on plan (monthly/yearly)

---

## 8. Health Check

### GET /health

**Response (200):**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "environment": "production"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable description"
}
```

**Common HTTP Status Codes:**
| Code | Meaning |
|------|---------|
| 400 | Validation error (bad input) |
| 401 | Authentication required or invalid credentials |
| 403 | Forbidden (account deactivated or subscription inactive) |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate email) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Rate Limiting

- **General:** 100 requests per 15 minutes per IP
- **Auth endpoints:** 20 requests per 15 minutes per IP

---

## Automated Reminders (Cron Jobs)

The backend runs automated jobs (no manual triggering needed):

| Job | Schedule | Description |
|-----|----------|-------------|
| 24-hour reminders | Every 30 minutes | Sends WhatsApp reminder for appointments 23-25 hours away |
| 3-hour reminders | Every 15 minutes | Sends WhatsApp reminder for appointments 2.5-3.5 hours away |
| No-show marking | Every hour | Marks past unconfirmed appointments as `no_show` |
| Subscription check | Daily at 21:00 UTC (midnight Riyadh) | Expires overdue subscriptions |
