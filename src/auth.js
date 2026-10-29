const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const crypto = require("crypto");
const { rateLimit } = require("express-rate-limit");
const { User } = require("./db");
const { isProduction, frontendUrl, googleCallbackUrl } = require("./config");

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});
const googleStateCookie = "crm_google_oauth_state";

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60 * 1000,
  };
}

function readCookie(req, name) {
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

function googleConfig() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: googleCallbackUrl,
    frontendUrl,
  };
}

function redirectOAuthError(res) {
  return res.redirect(`${frontendUrl}/auth/callback#error=google`);
}

function createToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
  }
  return jwt.sign(
    { sub: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" },
  );
}

function publicUser(user) {
  return {
    id: String(user.id),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : null;

    if (fullName.length < 2 || fullName.length > 120) {
      return res.status(400).json({ error: "Full name must be between 2 and 120 characters." });
    }
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Password must be between 8 and 72 characters." });
    }
    if (phone && phone.length > 32) {
      return res.status(400).json({ error: "Phone number must be 32 characters or fewer." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ fullName, email, phone: phone || null, passwordHash });
    return res.status(201).json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    return next(error);
  }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    return res.json({ user: publicUser(user), token: createToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get("/google", (req, res, next) => {
  try {
    const { clientId, redirectUri } = googleConfig();
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be set to a random string of at least 32 characters.");
    }

    const state = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const stateToken = jwt.sign({ purpose: "google-oauth-state", state, verifier }, process.env.JWT_SECRET, { expiresIn: "10m" });
    res.cookie(googleStateCookie, stateToken, oauthCookieOptions());

    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return res.redirect(authorizeUrl.toString());
  } catch (error) {
    console.error("Could not start Google OAuth:", error.message);
    return redirectOAuthError(res);
  }
});

router.get("/google/callback", async (req, res) => {
  const stateToken = readCookie(req, googleStateCookie);
  const { maxAge, ...clearOptions } = oauthCookieOptions();
  res.clearCookie(googleStateCookie, clearOptions);

  try {
    if (req.query.error || typeof req.query.code !== "string" || typeof req.query.state !== "string" || !stateToken) {
      return redirectOAuthError(res);
    }
    const stateData = jwt.verify(stateToken, process.env.JWT_SECRET);
    if (stateData.purpose !== "google-oauth-state" || stateData.state !== req.query.state || !stateData.verifier) {
      return redirectOAuthError(res);
    }

    const { clientId, clientSecret, redirectUri, frontendUrl } = googleConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: stateData.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) throw new Error("Google authorization code exchange failed.");
    const googleTokens = await tokenResponse.json();
    if (typeof googleTokens.access_token !== "string") throw new Error("Google did not return an access token.");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${googleTokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!profileResponse.ok) throw new Error("Could not retrieve the Google account profile.");
    const profile = await profileResponse.json();
    if (typeof profile.sub !== "string" || !profile.sub || typeof profile.email !== "string" || profile.email_verified !== true) {
      throw new Error("Google account must have a verified email address.");
    }

    const email = profile.email.trim().toLowerCase();
    const googleId = profile.sub;
    let user = await User.findOne({ googleId });

    if (!user) {
      // Link an existing email/password account that has no Google identity yet.
      user = await User.findOneAndUpdate(
        { email, googleId: null },
        { $set: { googleId } },
        { new: true },
      );
    }
    if (!user) {
      if (await User.exists({ email })) {
        throw new Error("This email address is already linked to a different Google account.");
      }
      const name = typeof profile.name === "string" ? profile.name.trim() : "";
      const fullName = (name.length >= 2 ? name : "Google User").slice(0, 120);
      user = await User.create({ fullName, email, googleId });
    }

    const token = createToken(user);
    const callback = new URL(`${frontendUrl}/auth/callback`);
    callback.hash = new URLSearchParams({ token, user: JSON.stringify(publicUser(user)) }).toString();
    return res.redirect(callback.toString());
  } catch (error) {
    console.error("Google OAuth callback failed:", error.message);
    return redirectOAuthError(res);
  }
});

module.exports = router;
