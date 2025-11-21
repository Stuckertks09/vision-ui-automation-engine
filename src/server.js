import "./loadEnv.js";
import express from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import http from 'http';
import path from "path";
import { fileURLToPath } from "url";

// Init OpenAI
import { initOpenAI } from './utils/openaiClient.js';

// Routes
import agentRoutes from './routes/agentRoutes.js';
import datasetRoutes from "./routes/datasetRoutes.js";

// Init OpenAI client
initOpenAI();

const app = express();
const server = http.createServer(app);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse JSON
app.use(express.json());

// Global rate limiter (50 req/min)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => req.body?.sessionId || ipKeyGenerator(req),
  handler: (req, res) => {
    res.status(429).json({
      status: 429,
      error: 'Too many requests — slow down.',
    });
  }
});
app.use(limiter);

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Routes
app.use('/api/agent', agentRoutes);
app.use("/api/dataset", datasetRoutes);

// Serve dataset and dataset viewer
app.use("/dataset", express.static(path.join(__dirname, "../dataset")));
app.use("/dataset-viewer", express.static(path.join(__dirname, "./datasetViewer")));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
const port = process.env.PORT || 5005;
server.listen(port, () => {
  console.log(`🚀 SoftLight Agent B server running on port ${port}`);
});
