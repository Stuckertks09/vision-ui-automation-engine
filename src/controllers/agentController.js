import { runAgent } from "../agentB/index.js";

export async function runAgentTask(req, res) {
  try {
    const { app, task } = req.body;

    if (!app || !task) {
      return res.status(400).json({ error: "app and task are required" });
    }

    const result = await runAgent(app, task);

    return res.json({
      success: true,
      ...result
    });

  } catch (err) {
    console.error("AgentError:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
