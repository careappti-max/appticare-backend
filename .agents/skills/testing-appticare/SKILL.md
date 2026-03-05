# Testing ApptiCare SaaS Platform

## Overview
ApptiCare is a dental clinic SaaS with a Node.js/Express backend (Railway) and static HTML frontend (Netlify). WhatsApp reminders are sent via Green API.

## Devin Secrets Needed
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin access
- `RAILWAY_TOKEN` - Railway deployment token
- `GITHUB_USERNAME` / `GITHUB_PASSWORD` - GitHub access for PRs
- Green API credentials are set as Railway env vars (GREEN_API_URL, GREEN_API_ID_INSTANCE, GREEN_API_TOKEN_INSTANCE)

## URLs
- **Frontend**: https://appticare.com (also https://appticare.netlify.app)
- **Backend API**: https://appticare-api-production.up.railway.app
- **Railway Dashboard**: https://railway.app (project: appticare-backend)
- **Supabase**: https://jjoefvdgtjcnsfyqathe.supabase.co

## Test Credentials
- **Clinic login**: `test@prodclinic.com` / `ProdTest123!`
- **Test patient (Fahad)**: phone `+966502494316`

## Browser Auto-Capitalization Workaround
When typing into form fields in Chrome, text may get auto-capitalized (especially emails and URLs). **Always use clipboard paste** (`xclip -selection clipboard` + Ctrl+V) instead of the `type` action for:
- Email addresses
- Passwords
- API tokens/URLs
- Railway environment variable names and values

Example:
```bash
echo -n "test@prodclinic.com" | xclip -selection clipboard
```
Then use Ctrl+V to paste into the browser field.

## Testing WhatsApp Reminders

### End-to-End Flow
1. Open https://appticare.com
2. Login with test credentials (use clipboard paste for email)
3. Navigate to **Appointments** page via sidebar
4. Click **Send Reminder** button on any appointment row
5. Accept the browser confirmation dialog
6. Verify green toast: "WhatsApp reminder sent successfully!"
7. Check Reminder Logs page to confirm status is "sent"

### API-Based Testing
You can also test via API if UI testing is blocked:
```bash
TOKEN=$(curl -s -X POST https://appticare-api-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@prodclinic.com","password":"ProdTest123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

curl -s -X POST https://appticare-api-production.up.railway.app/api/reminders/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appointment_id":"<APPOINTMENT_ID>","reminder_type":"manual"}'
```

### Green API Notes
- Green API works via WhatsApp Web linking (not Meta Business API)
- The linked WhatsApp number might disconnect if the phone logs out
- Free plan: 3 unique chats/month; Business plan: $12/mo for production
- To check instance status: `GET https://7103.api.greenapi.com/waInstance{ID}/getStateInstance/{TOKEN}`
- If the instance becomes unauthorized, the user needs to re-scan a QR code from the Green API dashboard

## Page Verification Checklist
All 5 pages to verify after any backend changes:
1. **Dashboard** - Stats cards + recent appointments table
2. **Patients** - Patient list with name, phone, email
3. **Appointments** - Appointment list with Send Reminder buttons
4. **Reminders** - Reminder logs with sent/failed status
5. **Billing** - Subscription status + plan cards

## Railway Environment Variables
When setting env vars on Railway via the browser UI:
- The "New Variable" form may lowercase variable names if you type them
- **Always use clipboard paste** for both variable names and values
- After adding variables, click "Deploy" to apply changes
- The backend auto-rebuilds from the `main` branch on Railway
