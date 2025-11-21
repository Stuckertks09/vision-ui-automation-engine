import bucket from "./gcsClient.js";
import { v4 as uuidv4 } from "uuid";

export async function uploadScreenshot(buffer, app, task, stepIndex) {
  const cleanTask = task.replace(/\s+/g, "_").toLowerCase();
  const filePath = `screenshots/${app}/${cleanTask}/${stepIndex}_${uuidv4()}.png`;

  const file = bucket.file(filePath);

  await file.save(buffer, {
    contentType: "image/png",
    resumable: false
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

  return { publicUrl, filePath };
}
