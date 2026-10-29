# CRM backend

Express API for the CRM signup and sign-in screens. It uses MongoDB (Atlas) through Mongoose, bcrypt password hashes, and JWTs.

## Setup

1. Install Node.js 20 or newer.
2. In this directory run `npm install`.
3. If you do not already have a local `.env`, copy `.env.example` to `.env`. Set `MONGODB_URI` to your MongoDB Atlas connection string (Atlas → your cluster → Connect → Drivers → Node.js) and keep `JWT_SECRET` in your existing `.env`. `MONGODB_DB_NAME` defaults to `crm`. In Atlas → Network Access, allow your current IP address (or your server's IP when deployed).
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a Google OAuth 2.0 Web application client. Set `GOOGLE_CALLBACK_URL` to the exact redirect URI registered in Google Cloud Console. For local development, use `http://localhost:4000/api/auth/google/callback`. Set `FRONTEND_URL` to `http://localhost:3000`.
5. Run `npm run dev`.

On startup the API connects to MongoDB and ensures the `users` collection indexes (unique email, unique Google ID). It listens on port 4000 by default; `/health` checks the API and database connection.
Google OAuth uses the authorization-code flow with state validation and PKCE. Google-only accounts are stored in the same `users` collection with a Google subject ID and no password hash. Existing accounts with a matching verified Google email are linked to that Google identity.

For the local Google OAuth client, configure the authorized JavaScript origin as `http://localhost:3000` and the authorized redirect URI as `http://localhost:4000/api/auth/google/callback`. For deployment, use the deployed frontend origin and exact backend callback URL.

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

The frontend origin is controlled by `CLIENT_ORIGIN` (comma-separated for multiple origins). Never commit `.env` or expose `MONGODB_URI` or `JWT_SECRET` in browser code.
