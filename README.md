# Jal Drishti

Water logging detection and hotspot monitoring project.

## Backend Configuration

Create `backend/.env` from `backend/.env.example` and fill the required service credentials:

```env
SUPABASE_URL=
SUPABASE_KEY=
WEATHER_API_KEY=
TWILIO_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=whatsapp:
OFFICER_NUMBER=whatsapp:
```

## Frontend Configuration

Create `frontend/.env` from `frontend/.env.example`:

```env
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_KEY=
```

`Memory.md`, dependency folders, build output, and local `.env` files are excluded from git.
