import fs from "fs";
import path from "path";

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function saveLocalScreenshot(buffer, dir, filename) {
  ensureDir(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
