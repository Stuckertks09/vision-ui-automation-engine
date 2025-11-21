// src/runTask.js

import { launchBrowser, safeGoto, getDomSnapshot } from "./agentB/browser.js";
import { captureScreenshot, screenshotToBase64, uploadScreenshot } from "./agentB/capture.js";
import { planAction } from "./agentB/llm.js";
import { executeAction } from "./agentB/actionExecutor.js";
import { writeStepImage, writeStepMetadata, finalizeTask } from "./agentB/datasetWriter.js";
import { appRegistry } from "./apps/appRegistry.js";

/**
 * Optional heuristic for stopping early if a success state is detected.
 */
function checkSuccess(dom, successChecks = []) {
  if (!successChecks.length) return false;

  // Flatten DOM text content
  const textBlob = dom
    .map(el => `${el.text || ""} ${el.placeholder || ""}`.toLowerCase())
    .join(" ");

  return successChecks.some(str =>
    textBlob.includes(str.toLowerCase())
  );
}

export async function runTask({ task, app }) {
  if (!task) throw new Error("Missing 'task'");
  if (!app || !appRegistry[app]) throw new Error(`Unknown app "${app}"`);

  const config = appRegistry[app];
  const successChecks = config.successChecks || [];

  // slug for folder names, dataset, GCS paths
  const taskSlug = task.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  console.log(`\n🔧 Starting Agent B run`);
  console.log(`   App:  ${app}`);
  console.log(`   Task: ${task}`);
  console.log(`   Slug: ${taskSlug}\n`);

  // Launch browser
  const { browser, page } = await launchBrowser(false, config.storageState);
  await safeGoto(page, config.startUrl);

  let stepIndex = 1;
  let done = false;
  let loopSafety = 0;

  try {
    while (!done && loopSafety < 25) {
      loopSafety++;
      console.log(`\n──────────── Step ${stepIndex} ────────────`);

      //
      // 1. Take screenshot
      //
      const screenshotBuffer = await captureScreenshot(page);
      const screenshotBase64 = screenshotToBase64(screenshotBuffer);

      // Upload to GCS
      const gcsUrl = await uploadScreenshot(screenshotBuffer, taskSlug, stepIndex);

      // Save locally for dataset
      writeStepImage(taskSlug, stepIndex, screenshotBuffer);

      //
      // 2. Capture DOM snapshot
      //
      const dom = await getDomSnapshot(page);

      //
      // 3. Optional success detection
      //
      const heuristicDone = checkSuccess(dom, successChecks);
      if (heuristicDone) {
        console.log("🟢 Success heuristic triggered — stopping early.");
        writeStepMetadata(taskSlug, stepIndex, {
          action: { action: "done", reason: "success heuristic" },
          gcsUrl,
          domSample: dom.slice(0, 5),
        });
        done = true;
        break;
      }

      //
      // 4. LLM decides next action
      //
      const action = await planAction({
        goal: task,
        screenshotBase64,
        dom,
      });

      writeStepMetadata(taskSlug, stepIndex, {
  step: stepIndex,
  label: `${action.action} ${action.selector || action.text || ""}`.trim(),
  action,
  gcsUrl,
  domSample: dom.slice(0, 5)
});

      console.log(`➡️ Next Action:`, action);

      if (action.action === "done") {
        console.log("🟢 LLM indicated completion.");
        done = true;
        break;
      }

      //
      // 5. Execute action
      //
      const status = await executeAction(page, action);

      if (status === "done") {
        console.log("🟢 Executor signaled completion.");
        done = true;
        break;
      }

      stepIndex++;
      await page.waitForTimeout(500); // let UI settle
    }

  } catch (err) {
    console.error("❌ Task crashed:", err.message);
    console.error(err);
  }

  //
  // Finalize dataset
  //
const description = `
Agent B executed the task "${task}" against the ${app} web app.
It captured ${stepIndex} UI states, including any non-URL views such as modals,
menus, and inline editors. This dataset represents the real-time workflow the
agent interpreted and navigated using screenshot analysis, DOM sampling, and
generalized action planning—without any hardcoded selectors or task-specific logic.
`.trim();

  await finalizeTask(taskSlug, {
    task,
    app,
    steps: stepIndex,
    ended: done ? "success" : "loop-limit",
    description
  });

  await browser.close();

  console.log(`\n🏁 Task Complete: ${done ? "SUCCESS" : "LIMIT/FAILURE"}`);
  console.log(`📁 Dataset available at /dataset/${taskSlug}/\n`);

  return {
    task,
    app,
    steps: stepIndex,
    status: done ? "success" : "failure/loop-limit",
    dataset: `/dataset/${taskSlug}/`,
  };
}
