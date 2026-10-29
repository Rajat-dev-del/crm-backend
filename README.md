# CRM backend

Express API for the CRM signup and sign-in screens. It uses MongoDB (Atlas) through Mongoose, bcrypt password hashes, and JWTs.

## Setup

1. Install Node.js 20 or newer.
2. In this directory run `npm install`.
3. If you do not already have a local `.env`, copy `.env.example` to `.env`. Set `MONGODB_URI` to your MongoDB Atlas connection string (Atlas → your cluster → Connect → Drivers → Node.js) and keep `JWT_SECRET` in your existing `.env`. `MONGODB_DB_NAME` defaults to `crm`. In Atlas → Network Access, allow your current IP address (or your server's IP when deployed).
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a Google OAuth 2.0 Web application client. Frontend and callback URLs are picked by environment in `src/config.js`: localhost in development, the Vercel URLs (`https://crm-frontend-rho-amber.vercel.app`, `https://crm-backend-six-umber.vercel.app`) when `NODE_ENV=production` or on a Vercel production deployment. Set `CLIENT_ORIGIN`, `FRONTEND_URL` or `GOOGLE_CALLBACK_URL` only to override them.
5. Run `npm run dev`.

On startup the API connects to MongoDB and ensures the `users` collection indexes (unique email, unique Google ID). It listens on port 4000 by default; `/health` checks the API and database connection.
Google OAuth uses the authorization-code flow with state validation and PKCE. Google-only accounts are stored in the same `users` collection with a Google subject ID and no password hash. Existing accounts with a matching verified Google email are linked to that Google identity.

For the local Google OAuth client, configure the authorized JavaScript origin as `http://localhost:3000` and the authorized redirect URI as `http://localhost:4000/api/auth/google/callback`. For deployment, use the deployed frontend origin and exact backend callback URL.

## Deploying to Vercel

`src/server.js` exports the Express app, which Vercel detects and runs as a serverless function; `app.listen()` only runs when the file is started directly. The MongoDB connection is opened on the first request and reused while the instance stays warm.

1. Import the `crm-backend` repository in Vercel (framework preset: Other / Express). No build command is needed.
2. Add the environment variables from `.env.example` in Project → Settings → Environment Variables, with `NODE_ENV=production`. `PORT` is not needed. Leave out `CLIENT_ORIGIN`, `FRONTEND_URL` and `GOOGLE_CALLBACK_URL` so the production URLs from `src/config.js` apply; register `https://crm-backend-six-umber.vercel.app/api/auth/google/callback` in Google Cloud Console.
3. In Atlas → Network Access, allow `0.0.0.0/0`; Vercel has no fixed outbound IPs.
4. The frontend picks the backend URL from its committed `.env.production`; no frontend variable is needed.

Rate limits are kept in memory, so on Vercel they apply per function instance rather than globally.

## Endpoints

### `POST /api/auth/register`

JSON body:

```json
{
  "fullName": "Rajat Sharma",
  "email": "rajat@example.com",
  "password": "a-long-password",
  "phone": "+91 9555908304"
}
```

Returns `201` and `{ "user": { "id", "fullName", "email", "phone", "createdAt" }, "token" }`.

### `POST /api/auth/login`

JSON body:

```json
{
  "email": "rajat@example.com",
  "password": "a-long-password"
}
```

Returns `200` with the same user and token shape. Use `Authorization: Bearer <token>` for authenticated requests added later. Errors return `{ "error": "..." }` with an appropriate HTTP status.

### Google OAuth

Start browser sign-in at `GET /api/auth/google`. Google returns to `GET /api/auth/google/callback`; the backend exchanges the code and redirects to the frontend's `/auth/callback` route with the app token in the URL fragment. The fragment is not sent in the HTTP request to the frontend server.

The allowed frontend origin comes from `src/config.js`; set `CLIENT_ORIGIN` (comma-separated for multiple origins) to override it. Never commit `.env` or expose `MONGODB_URI` or `JWT_SECRET` in browser code.
