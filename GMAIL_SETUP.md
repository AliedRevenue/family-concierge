# Gmail Setup Guide

## ✅ What We Just Built

Automatic OAuth flow that:
- Starts a temporary web server
- Opens your browser automatically  
- Captures the authorization code
- Saves your token
- Shuts down the server
- Continues running the agent

**Just like any phone or web app!**

## 📋 Setup Steps

### 1. Get Google Cloud Credentials

1. **Go to**: https://console.cloud.google.com/
2. **Create a project** (or select existing)
3. **Enable APIs**:
   - Go to "APIs & Services" → "Library"
   - Search "Gmail API" → Click → Enable
   - Search "Google Calendar API" → Click → Enable
4. **Create OAuth Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "OAuth 2.0 Client ID"
   - If prompted, configure consent screen:
     - User Type: **External** (for personal use)
     - App name: "Family Concierge Agent"
     - User support email: Your email
     - Developer contact: Your email
     - Click "SAVE AND CONTINUE" through all screens
   - Application type: **Desktop app**
   - Name: "Family Concierge Agent"
   - Click "CREATE"
   - **Copy the Client ID and Client Secret**

### 2. Configure Environment

Edit `.env` and add your credentials:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
```

⚠️ **Important**: The redirect URI must be **exactly** `http://localhost:3000/oauth/callback`

### 3. Add Redirect URI to Google Cloud

1. Go back to Google Cloud Console → Credentials
2. Click your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", click "+ ADD URI"
4. Add: `http://localhost:3000/oauth/callback`
5. Click "SAVE"

### 4. Run Authorization

```bash
npm run dev
```

**What happens:**
1. Agent detects no token exists
2. Starts OAuth server on port 3000
3. **Opens your browser automatically** to Google authorization page
4. You click "Allow"
5. Google redirects to `localhost:3000/oauth/callback`
6. Server captures the code and exchanges it for tokens
7. Browser shows "✅ Authorization Successful!"
8. Server shuts down
9. Agent continues running

**Token saved to**: `oauth-tokens/token.json` (automatically refreshed)

## 🧪 Testing Phase 2 with Real Email

Once authorized, you can:

### Generate a digest from real data:
```bash
npm run digest
```

### Process new emails:
```bash
npm run dev
```

### Check what got extracted:
```bash
sqlite3 data/fca.db "SELECT id, event_intent->>'title', status, confidence FROM events ORDER BY created_at DESC LIMIT 10;"
```

## 🔧 Troubleshooting

### "Port 3000 is already in use"
Something else is running on port 3000. Options:
1. Stop the other app
2. Change the port in `.env`: `GOOGLE_REDIRECT_URI=http://localhost:3001/oauth/callback`
3. Update the redirect URI in Google Cloud Console to match

### "Redirect URI mismatch"
The redirect URI in:
- `.env` 
- Google Cloud Console
- Your OAuth Client

Must **all be exactly the same**. Check for:
- `http` vs `https`
- Port number
- `/oauth/callback` path

### "Browser didn't open"
The URL will be printed in the terminal. Copy/paste it manually:
```
📖 Opening browser for authorization...
https://accounts.google.com/o/oauth2/v2/auth?...
```

### "Access blocked: This app isn't verified"
This is normal for development. Click "Advanced" → "Go to [App Name] (unsafe)"

This only appears because you're the developer. For production, you'd submit the app for Google verification.

## 🎉 Success Indicators

You're successfully connected when:
- ✅ File exists: `oauth-tokens/token.json`
- ✅ No authorization prompts on subsequent runs
- ✅ `npm run dev` processes emails
- ✅ Events appear in the database

## 📊 Next Steps After Authorization

1. **Test digest generation** with your real email data
2. **Verify HTML** looks good with actual events
3. **Check approval tokens** are created for low-confidence events
4. **Test with different email sources** (school, sports, etc.)
