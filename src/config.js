// Public URLs per environment. Any value set in .env / Vercel environment variables still wins.
// Vercel always sets VERCEL_ENV, so deployed functions use production URLs even if NODE_ENV was uploaded as "development".
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const urls = isProduction
  ? {
    frontendUrl: "https://crm-frontend-rho-amber.vercel.app",
    apiUrl: "https://crm-backend-seven-mu.vercel.app",
  }
  : {
    frontendUrl: "http://localhost:3000",
    apiUrl: `http://localhost:${Number(process.env.PORT) || 4000}`,
  };

function trimSlash(url) {
  return url.trim().replace(/\/$/, "");
}

const clientOrigins = (process.env.CLIENT_ORIGIN || urls.frontendUrl).split(",").map(trimSlash);

module.exports = {
  isProduction,
  clientOrigins,
  frontendUrl: trimSlash(process.env.FRONTEND_URL || clientOrigins[0]),
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || `${urls.apiUrl}/api/auth/google/callback`,
};
