// src/agentB/capture.js
import bucket from "../utils/gcsClient.js";
import { v4 as uuidv4 } from "uuid";

export async function captureScreenshot(page) {
  return await page.screenshot({ fullPage: true });
}

export function screenshotToBase64(buffer) {
  return buffer.toString("base64");
}

export async function uploadScreenshot(buffer, taskName, stepIndex) {
  const cleanTask = taskName.replace(/\s+/g, "_").toLowerCase();
  const filePath = `tasks/${cleanTask}/${stepIndex}_${uuidv4()}.png`;

  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  return publicUrl;
}
