import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import folderRoutes from "./routes/folders.js";
import repositoryRoutes from "./routes/repositories.js";
import syncRoutes from "./routes/sync.js";
import settingsRoutes from "./routes/settings.js";
import portfolioRoutes from "./routes/portfolio.js";
import categorizeRoutes from "./routes/categorize.js";
import healthRoutes from "./routes/health.js";
import aiCategorizeRoutes from "./routes/ai-categorize.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/portfolio", portfolioRoutes); // public, unauthenticated
app.use("/api/categorize", categorizeRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/ai-categorize", aiCategorizeRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Repofolio API listening on :${PORT}`));
