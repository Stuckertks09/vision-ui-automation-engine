import fs from "fs";
import path from "path";

export function ensureTaskFolder(taskName) {
  const folder = path.join(process.cwd(), "dataset", taskName);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
}

export function writeStepImage(taskName, stepIndex, buffer) {
  const folder = ensureTaskFolder(taskName);
  const filePath = path.join(folder, `${String(stepIndex).padStart(4, "0")}.png`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function writeStepMetadata(taskName, stepIndex, metadata) {
  const folder = ensureTaskFolder(taskName);
  const filePath = path.join(folder, `${String(stepIndex).padStart(4, "0")}.json`);
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
  return filePath;
}

export function finalizeTask(taskName, meta) {
  const folder = ensureTaskFolder(taskName);
  const filePath = path.join(folder, `meta.json`);
  fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  return filePath;
}
