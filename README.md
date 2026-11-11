# SpeakSafe

Confidential concern reporting and case management for campuses and workplaces.
HCI + Information Security semester project. **Prototype: do not submit real incidents.**

```
SpeakSafe/
├── client/   React + Vite + TypeScript + Tailwind (reporter, handler and admin pages)
└── server/   Node.js + Express + TypeScript + Prisma (API) → PostgreSQL
```

## First-time setup (Windows, PowerShell)

1. **Create the database** (PostgreSQL 18 is already installed and running):
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE speaksafe;"
   ```
   Enter your postgres password when asked.

2. **Configure the server**:
   ```powershell
   cd D:\Projects\SpeakSafe\server
   copy .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Open `.env` in VS Code: put your postgres password in `DATABASE_URL`, and paste the random
   value printed above into `SERVER_SECRET`. Never share or commit `.env`.

3. **Install and set up the server**:
   ```powershell
   npm install
   npx prisma migrate dev --name init
   npm run db:seed
   ```
   The seed prints demo committee logins and their password. Keep them for testing.

4. **Install the client**:
   ```powershell
   cd D:\Projects\SpeakSafe\client
   npm install
   ```

## Running (two terminals)

```powershell
# Terminal 1
cd D:\Projects\SpeakSafe\server
npm run dev          # API on http://localhost:4000

# Terminal 2
cd D:\Projects\SpeakSafe\client
npm run dev          # App on http://localhost:5173
```

Check the API: http://localhost:5173/api/health should show `{"status":"ok","database":"ok"}`.

## Useful commands

| Where | Command | What it does |
|---|---|---|
| server | `npm test` | Run automated tests |
| server | `npm run db:studio` | Browse the database in the browser |
| client | `npm run build` | Production build |

## Security notes

- Report content is encrypted in the browser; the database stores only ciphertext.
- `server/prisma/sql/audit_role.sql` creates a restricted database role that cannot edit or delete
  audit-log entries. Run it after the first migration and switch `DATABASE_URL` to that role
  before the security testing week.
- No reporter IP addresses are logged by the application.
