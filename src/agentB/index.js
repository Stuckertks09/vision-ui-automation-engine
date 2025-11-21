// src/agentB/index.js
import { runTask } from "../runTask.js";

export async function runAgent(app, task) {
  return runTask({ app, task });
}
