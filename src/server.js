require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const { initializeDatabase, pingDatabase } = require("./db");
const authRouter = require("./auth");

const app = express();
const port = Number(process.env.PORT) || 4000;
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error(`Origin ${origin} is not allowed by CORS. Add it to CLIENT_ORIGIN.`), { status: 403 }));
  },
}));
app.use(express.json({ limit: "10kb" }));

app.get("/health", async (_req, res, next) => {
  try {
    await pingDatabase();
    return res.json({ status: "ok", database: "connected" });
  } catch (error) {
    return next(error);
  }
});

app.use("/api/auth", authRouter);

app.use((error, _req, res, _next) => {
  if (error.status === 403) {
    console.warn(error.message);
    return res.status(403).json({ error: error.message });
  }
  console.error(error);
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

async function start() {
  await initializeDatabase();
  app.listen(port, () => console.log(`CRM API listening on http://localhost:${port}`));
}

start().catch((error) => {
  console.error("Could not start CRM API:", error.message);
  process.exitCode = 1;
});
