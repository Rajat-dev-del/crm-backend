const mongoose = require("mongoose");

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure it.");
}

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320, unique: true },
    phone: { type: String, trim: true, maxlength: 32, default: null },
    passwordHash: { type: String, default: null },
    googleId: { type: String, default: null },
  },
  { timestamps: true },
);
// Google-only and password-only accounts share this collection; only real Google IDs must be unique.
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string" } } },
);

const User = mongoose.model("User", userSchema);

let connection = null;

// Connects once per process and reuses it, so serverless instances (Vercel) don't reconnect on every request.
// A failed attempt is cleared so the next request retries.
function initializeDatabase() {
  connection ??= (async () => {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || "crm",
      serverSelectionTimeoutMS: 10_000,
    });
    await User.syncIndexes();
  })().catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

async function pingDatabase() {
  await mongoose.connection.db.admin().ping();
}

module.exports = { User, initializeDatabase, pingDatabase };
