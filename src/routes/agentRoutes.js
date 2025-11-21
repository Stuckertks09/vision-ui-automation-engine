import express from "express";
import { runAgentTask } from "../controllers/agentController.js";

const router = express.Router();

router.post("/task", runAgentTask);

export default router;
