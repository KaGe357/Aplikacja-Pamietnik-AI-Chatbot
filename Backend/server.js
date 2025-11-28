import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import authenticateToken from "./middleware/auth.js";
import logger from "./config/logger.js";
import requestLogger from "./middleware/requestLogger.js";
import authRoutes from "./routes/auth.js";
import notesRoutes from "./routes/notes.js";
import aiProxyRoutes from "./routes/aiProxy.js";
import dotenv from "dotenv";
import db from "./config/database.js";
dotenv.config();
const app = express();

// Trust proxy (nginx)
app.set('trust proxy', 1);

// Security: hide Express fingerprint and apply common security headers
app.disable("x-powered-by");
app.use(helmet());

const limitInMinutes = 15;

// Disable rate limiting in test environment
const isTestEnvironment = process.env.NODE_ENV === "test";

// Rate limiter for all requests
const generalLimiter = isTestEnvironment
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: limitInMinutes * 60 * 1000, // 15 minutes
      max: 100, // limit 100 requests per IP
      message: {
        msg: "Zbyt wiele requestów z tego IP, spróbuj ponownie później",
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

// More restrictive limiter for auth endpoints
const authLimiter = isTestEnvironment
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: limitInMinutes * 60 * 1000, // 15 minutes
      max: 5, // only 5 login/register attempts
      message: {
        msg: "Zbyt wiele prób logowania, spróbuj ponownie za 15 minut",
      },
      skipSuccessfulRequests: true, // don't count successful requests
    });

// Dedicated limiter for expensive/external API calls (AI)
const aiLimiter = isTestEnvironment
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 1 minuta
      max: 10, // max 10 requests per minute per IP
      message: { msg: "Zbyt wiele zapytań do usługi AI. Spróbuj za chwilę." },
      standardHeaders: true,
      legacyHeaders: false,
    });

const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(generalLimiter);
app.use(requestLogger);

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/notes", authenticateToken, notesRoutes);
app.use("/api/ai", aiLimiter, authenticateToken, aiProxyRoutes);

// Server instance (initialized only when running directly)
let server;

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    logger.info("HTTP server closed.");
    db.destroy(() => {
      logger.info("Database connection closed");
      process.exit(0);
    });
  });

  // force shutdown after 10sec
  setTimeout(() => {
    logger.error("Forcing shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const PORT = process.env.PORT || 5000;

// Global error handler
//          eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  res.status(err.status || 500).json({
    msg: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;

// Only start server if this file is run directly (not imported in tests)
if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, "0.0.0.0", () => {
    logger.info(`🚀 Server running on http://0.0.0.0:${PORT}`, {
      environment: process.env.NODE_ENV || "development",
      port: PORT,
    });
  });
}
