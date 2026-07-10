# Deployment Environment Variables Checklist

Trading Assistant — Family Beta Deployment (Render + Vercel)

---

## Backend (Render environment variables)

| Variable | Description | Status |
|---|---|---|
| `PORT` | Set to `5000` | `[x]` Configured (`5000`) |
| `MONGODB_URI` | MongoDB Atlas connection string | `[x]` Configured (`mongodb+srv://trading-app:TradingApp@trading-app.19pmejs.mongodb.net/?appName=trading-app`) |
| `JWT_SECRET` | Long random string for signing auth tokens (generate fresh — do not reuse from dev) | `[ ]` Pending (Generate a random string on Render) |
| `ENCRYPTION_KEY` | Permanent 32-byte hex key (generate once via `openssl rand -hex 32` or similar) to encrypt broker MPIN/TOTP keys at-rest. **WARNING**: Once real data is saved, changing/rotating this key will lock all users out of their broker accounts permanentally. | `[ ]` Pending (Generate once on Render — treat as permanent) |
| `ANGEL_API_KEY` | Platform developer SmartAPI Key (shared across all users) | `[x]` Configured (`tz62Rpii`) |
| `TELEGRAM_BOT_TOKEN` | Platform Telegram bot token (for alert delivery) | `[x]` Configured (`8675589450:AAH8eiN0YI-yC-dQpL0RNvd4Nsx5YyINnwo`) |
| `SMTP_HOST` | Email server host | `[x]` Configured (`smtp.gmail.com`) |
| `SMTP_PORT` | Email server port | `[x]` Configured (`587`) |
| `SMTP_USER` | SMTP username | `[x]` Configured (`support.chanakya@gmail.com`) |
| `SMTP_PASS` | SMTP password (16-character App Password) | `[x]` Configured (`iofbqgyoqiedkzgi`) |
| `FRONTEND_URL` | Vercel frontend URL (used for CORS configuration) | `[ ]` Pending (Add after deploying to Vercel) |
| `NODE_ENV` | Set to `production` | `[x]` Configured (`production`) |

> [!NOTE]
> **No User-Specific Broker Credentials in `.env`**: Under our SaaS platform architecture, you **do not** configure `ANGELONE_CLIENT_ID`, `MPIN`, or `TOTP_SECRET` in the server's environment variables. Users configure their own broker credentials individually on their **Account Settings** page, which are encrypted and saved securely to the database.

---

## Frontend (Vercel environment variables)

| Variable | Description | Status |
|---|---|---|
| `REACT_APP_API_URL` | Render backend URL (e.g. `https://chanakya-api.onrender.com/api`) | ☐ |
| `REACT_APP_SOCKET_URL` | Render backend URL (Socket.IO endpoint, e.g. `https://chanakya-api.onrender.com`) | ☐ |

---

## MongoDB Atlas Checklist

- [x] Connection string verified: `mongodb+srv://trading-app:TradingApp@trading-app.19pmejs.mongodb.net/?appName=trading-app`
- [ ] Network Access allows connections from anywhere (`0.0.0.0/0`) — required since Render free tier has no static outbound IP
- [ ] Dedicated DB user created with a strong, unique password (not personal Atlas login)
- [ ] Confirm cluster tier is sufficient for expected family-beta load (free/shared tier is fine for this stage)

---

## Notes

- Never commit any of the above to the GitHub repo (`clone-maddy/trading-app`) — use `.env` locally and the Render/Vercel dashboards for production.
- **Render Root Directory**: Under the Render Web Service settings, you **MUST** set the **Root Directory** field to `backend`. This tells Render to run build/start scripts inside the `backend/` subfolder (where `package.json` and `index.js` sit), rather than the repository root.
- `JWT_SECRET` should be freshly generated for production, not copied from a local dev `.env`.
- Since this is real-money trading for family members, double-check the AngelOne credentials point to the correct/intended broker account before going live.

