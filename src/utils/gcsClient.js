import { Storage } from '@google-cloud/storage';
import path from "path";
import { fileURLToPath } from "url";

console.log("GCS_BUCKET at load time:", process.env.GCS_BUCKET);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to your service key:
const keyFilename = path.join(process.cwd(), "config/gcs-key.json");

const storage = new Storage({ keyFilename });

const bucketName = process.env.GCS_BUCKET;
const bucket = storage.bucket(bucketName);

export default bucket;
