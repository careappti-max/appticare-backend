# Testing ApptiCare Admin Dashboard

## Overview
The admin dashboard is a single-page HTML app deployed on Netlify at `admin.appticare.com`. It connects to the backend API at `appticare-api-production.up.railway.app`.

## Prerequisites
- Admin credentials stored in Devin secrets (ADMIN_EMAIL, ADMIN_PASSWORD)
- Backend must be deployed and healthy (check `/health` endpoint)
- CORS must include `admin.appticare.com` and `appticare-admin.netlify.app` in `src/app.js`

## Devin Secrets Needed
- SUPABASE_SERVICE_ROLE_KEY
- RAILWAY_TOKEN
- NETLIFY_TOKEN (for redeploying admin frontend)

## Key URLs
- Admin Dashboard: https://admin.appticare.com (also https://appticare-admin.netlify.app)
- Backend API: https://appticare-api-production.up.railway.app
- Clinic Frontend: https://appticare.com

## Testing Steps

### Login
- The `type` action in computer tools may uppercase text, which breaks password entry
- **Workaround**: Use `xdotool type --delay 30 --clearmodifiers 'password'` via bash to type credentials with correct case
- Alternative: Get a JWT token via curl and set it in localStorage via DevTools
- The login form stores the token in `localStorage` under key `admin_token`

### Pages to Test
1. **Overview** — Stats cards (Total Clinics, Active Clinics, Total Patients, Total Appointments, Reminders Sent, Inbound Messages), Subscription Breakdown table, Appointment Status Breakdown table, Recent Clinic Signups table
2. **Clinics** — Table with search/filter, View button for each clinic
3. **Clinic Details** — Owner info, stats cards (Patients, Appointments, Reminders Sent, Failed), Patients table, Appointments table, Deactivate/Activate button
4. **All Patients** — Cross-clinic patient list
5. **All Appointments** — Cross-clinic appointment list
6. **Reminders** — Recent reminders with type, status, sent timestamp
7. **Logout** — Returns to login page, clears token

### CORS Troubleshooting
- If login returns "Failed to fetch", check CORS config in `src/app.js` line ~55
- The admin dashboard origin (`https://admin.appticare.com`) must be in the allowed origins list
- Test CORS with: `curl -s -I -H "Origin: https://admin.appticare.com" -X OPTIONS https://appticare-api-production.up.railway.app/api/admin/login`
- Look for `access-control-allow-origin: https://admin.appticare.com` in the response

### Deployment
- Backend: Push to `main` branch on GitHub, Railway auto-deploys (~60 seconds)
- Frontend: Deploy via Netlify API (single HTML file)
- After merging backend changes, wait ~60 seconds for Railway to redeploy before testing
