# ApptiCare Deployment & Setup Guide

## Architecture Overview

```
Bubble (Frontend) --> Express Backend (Railway) --> Supabase (Database)
                          |
                    WhatsApp Cloud API (Messaging)
                    Moyasar (Payments)
```

---

## Production URLs

| Service | URL |
|---------|-----|
| Backend API | https://appticare-api-production.up.railway.app |
| Supabase Dashboard | https://supabase.com/dashboard/project/jjoefvdgtjcnsfyqathe |
| Bubble App | https://careappti.bubbleapps.io |
| GitHub Repo | https://github.com/careappti-max/appticare-backend |
| Railway Dashboard | https://railway.app (project: appticare-api) |

---

## Environment Variables

All environment variables are configured on Railway. To update them, go to Railway Dashboard > appticare-api > Variables.

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3000` (Railway auto-assigns) | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret) | Yes |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | Yes |
| `JWT_SECRET` | Secret for signing JWT tokens | Yes |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token | For WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID | For WhatsApp |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID | For WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Custom token for webhook verification | For WhatsApp |
| `MOYASAR_SECRET_KEY` | Moyasar secret API key | For Billing |
| `MOYASAR_PUBLISHABLE_KEY` | Moyasar publishable API key | For Billing |
| `MOYASAR_WEBHOOK_SECRET` | Moyasar webhook signing secret | For Billing |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | Yes |
| `DEFAULT_TIMEZONE` | `Asia/Riyadh` | Yes |

---

## WhatsApp Cloud API Setup

### Step 1: Create Meta Developer App

1. Go to https://developers.facebook.com/apps/
2. Click **Create App**
3. Select **"Other"** as use case
4. Select **"Business"** as app type
5. Name: `ApptiCare`, click **Create App**

### Step 2: Add WhatsApp Product

1. In the app dashboard, find **WhatsApp** and click **Set up**
2. You'll be directed to the WhatsApp Getting Started page
3. Note your **Phone Number ID** and **WhatsApp Business Account ID**

### Step 3: Generate Access Token

1. Go to **WhatsApp > API Setup**
2. Click **Generate** under "Temporary access token" (valid 24h)
3. For permanent token: Go to **Business Settings > System Users > Generate Token**
   - Create a System User with `admin` role
   - Generate token with `whatsapp_business_messaging` permission

### Step 4: Configure Webhook

1. Go to **WhatsApp > Configuration**
2. Click **Edit** next to Webhook URL
3. **Callback URL:** `https://appticare-api-production.up.railway.app/webhooks/whatsapp`
4. **Verify Token:** Use the value set in `WHATSAPP_VERIFY_TOKEN` env var
5. Click **Verify and save**
6. Subscribe to: `messages`

### Step 5: Set Environment Variables on Railway

Update these variables on Railway:
- `WHATSAPP_ACCESS_TOKEN` = your permanent access token
- `WHATSAPP_PHONE_NUMBER_ID` = your phone number ID
- `WHATSAPP_BUSINESS_ACCOUNT_ID` = your business account ID

### Step 6: Create Message Templates (Optional)

For production use, create approved message templates in the Meta Business Manager:
1. Go to **WhatsApp > Message Templates**
2. Create templates for appointment reminders in Arabic + English
3. Submit for approval (usually takes 24-48 hours)

---

## Moyasar Payment Setup

### Step 1: Get API Keys

1. Go to https://dashboard.moyasar.com
2. Navigate to **Settings > API Keys**
3. Copy your **Secret Key** and **Publishable Key**
4. For test mode, use test keys first

### Step 2: Configure Webhook

1. In Moyasar dashboard, go to **Settings > Webhooks**
2. Add webhook URL: `https://appticare-api-production.up.railway.app/webhooks/moyasar`
3. Select events: `payment.paid`, `payment.failed`

### Step 3: Set Environment Variables on Railway

- `MOYASAR_SECRET_KEY` = your secret key
- `MOYASAR_PUBLISHABLE_KEY` = your publishable key

---

## Bubble Frontend Setup

### Prerequisites

- Bubble app: **Careappti** (https://bubble.io/page?id=careappti)
- Pages created: `login`, `dashboard`, `patients`, `appointments`, `billing`

### Step 1: Install API Connector Plugin

1. Open Bubble editor
2. Go to **Plugins** tab (left sidebar)
3. Click **Add plugins**
4. Search for **"API Connector"** (by Bubble)
5. Click **Install**

### Step 2: Configure API Connection

1. In Plugins, click on **API Connector**
2. Click **Add another API**
3. Configure:
   - **API Name:** `ApptiCare API`
   - **Authentication:** None on API level (we handle JWT in headers)
   - **Shared headers:**
     - Key: `Content-Type`, Value: `application/json`

### Step 3: Add API Calls

For each endpoint, add an API call in the API Connector:

#### Login Call
- **Name:** `Login`
- **Method:** POST
- **URL:** `https://appticare-api-production.up.railway.app/api/auth/login`
- **Body type:** JSON
- **Body:**
```json
{
  "email": "<email>",
  "password": "<password>"
}
```
- Mark `email` and `password` as dynamic
- Click **Initialize call** to test

#### Get Patients Call
- **Name:** `Get Patients`
- **Method:** GET
- **URL:** `https://appticare-api-production.up.railway.app/api/patients`
- **Headers:**
  - Key: `Authorization`, Value: `Bearer <token>` (mark `token` as dynamic)
- Click **Initialize call**

#### Create Patient Call
- **Name:** `Create Patient`
- **Method:** POST
- **URL:** `https://appticare-api-production.up.railway.app/api/patients`
- **Headers:**
  - Key: `Authorization`, Value: `Bearer <token>` (mark `token` as dynamic)
- **Body:**
```json
{
  "full_name": "<full_name>",
  "phone_number": "<phone_number>"
}
```

Repeat this pattern for all endpoints. See `docs/API_REFERENCE.md` for the full endpoint list.

### Step 4: Build Login Page

1. Open the `login` page in Bubble editor
2. Add elements:
   - **Input:** Email (type: email)
   - **Input:** Password (type: password)
   - **Button:** "Login"
3. Add workflow on button click:
   - Action: **API Connector > Login**
   - Set email = Input Email's value
   - Set password = Input Password's value
   - Save token to **App State** (custom state `auth_token`)
   - Navigate to `dashboard` page

### Step 5: Build Dashboard Page

1. Add a **page load** condition: if `auth_token` is empty, redirect to `login`
2. Add elements:
   - Text: "Welcome, [user name]"
   - Repeating Group for today's appointments
   - Analytics cards (total patients, attendance rate, etc.)
3. Use **API Connector > Get Dashboard Analytics** to populate data

### Step 6: Build Patients Page

1. **Repeating Group** with patient list
2. **Popup** for adding/editing patients
3. **Search input** for filtering
4. Connect to: `Get Patients`, `Create Patient`, `Update Patient`, `Delete Patient` API calls

### Step 7: Build Appointments Page

1. **Repeating Group** with appointment list
2. **Date picker** filters
3. **Status badges** (color-coded by status)
4. **Popup** for creating appointments (patient dropdown + date picker)
5. Connect to appointment API calls

### Step 8: Build Billing Page

1. Display current subscription status via `Get Subscription` API
2. Plan cards (Monthly 299 SAR / Yearly 2990 SAR)
3. "Subscribe" button that calls `Create Session` API and redirects to `paymentUrl`
4. Payment history table via `Get Payment History` API

### Step 9: CORS Configuration

Make sure `ALLOWED_ORIGINS` on Railway includes your Bubble domain:
```
https://careappti.bubbleapps.io,https://careappti.bubbleapps.io/version-test
```

---

## Database Schema

### Tables (Supabase)

| Table | Description |
|-------|-------------|
| `users` | Clinic admin accounts + subscription info |
| `patients` | Patient records (multi-tenant) |
| `appointments` | Appointment scheduling + status tracking |
| `reminder_logs` | WhatsApp reminder delivery history |
| `inbound_messages` | Incoming WhatsApp replies |
| `payment_logs` | Moyasar payment history |

All tables use:
- `clinic_id` for multi-tenant isolation
- `is_deleted` for soft deletes
- `created_at` / `updated_at` timestamps
- UUID primary keys

---

## CI/CD

The GitHub repo is connected to Railway. Every push to `main` triggers an automatic deployment.

**Workflow:**
1. Push to `main` branch on GitHub
2. Railway detects the push
3. Railway builds using Dockerfile
4. Railway deploys the new version
5. Zero-downtime deployment

---

## Monitoring

### Health Check
```
GET https://appticare-api-production.up.railway.app/health
```

### Railway Logs
View real-time logs in Railway dashboard > appticare-api > Deployments > Logs

### Key Log Patterns
- `[WhatsApp]` - WhatsApp message processing
- `[Moyasar]` - Payment webhook processing
- `[Scheduler]` - Cron job execution
- `[Reminder]` - Reminder sending

---

## Troubleshooting

### Backend not responding
1. Check Railway deployment status
2. Verify environment variables are set
3. Check Railway logs for errors

### WhatsApp messages not sending
1. Verify `WHATSAPP_ACCESS_TOKEN` is valid (temporary tokens expire in 24h)
2. Check webhook is configured correctly
3. Verify phone number is registered in Meta Business Manager
4. Check Railway logs for `[WhatsApp]` errors

### Subscription not activating after payment
1. Check Moyasar webhook is configured
2. Verify `MOYASAR_SECRET_KEY` is correct
3. Check Railway logs for `[Moyasar]` errors

### Bubble API calls failing
1. Verify `ALLOWED_ORIGINS` includes your Bubble domain
2. Check JWT token is being sent in Authorization header
3. Verify token hasn't expired (24h lifetime)

---

## Admin Credentials (Test Account)

| Field | Value |
|-------|-------|
| Email | test@prodclinic.com |
| Password | ProdTest123! |

This account was created during testing. You can register new accounts via the API.
