import { OpenAI } from "openai";

let openai = null;

export const initOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in .env");
  }

  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("✓ OpenAI client initialized");
  }
};

export const getOpenAI = () => {
  if (!openai) throw new Error("OpenAI not initialized — call initOpenAI() first.");
  return openai;
};
