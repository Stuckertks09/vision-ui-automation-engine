import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base dataset path
const datasetPath = path.join(__dirname, "../../dataset");

/* ------------------------------------------------------------
   GET /api/dataset
   → Return list of dataset folders
-------------------------------------------------------------*/
router.get("/", (req, res) => {
  try {
    const folders = fs.readdirSync(datasetPath).filter(name =>
      fs.lstatSync(path.join(datasetPath, name)).isDirectory()
    );
    res.json(folders);
  } catch (err) {
    console.error("Dataset index error:", err);
    res.status(500).json({ error: "Failed to read dataset folder" });
  }
});

/* ------------------------------------------------------------
   GET /api/dataset/:folder
   → Return list of files in that dataset folder
-------------------------------------------------------------*/
router.get("/:folder", (req, res) => {
  try {
    const folder = req.params.folder;
    const folderPath = path.join(datasetPath, folder);

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: "Folder not found" });
    }

    const files = fs.readdirSync(folderPath);
    res.json(files);

  } catch (err) {
    console.error("Dataset folder error:", err);
    res.status(500).json({ error: "Failed to read dataset folder contents" });
  }
});

export default router;
