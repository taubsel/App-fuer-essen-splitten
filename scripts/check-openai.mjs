// Prüft, ob der OpenAI-Key funktioniert und Guthaben hat: node scripts/check-openai.mjs
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "proxy-injected" });
try {
  const r = await client.responses.create({ model: process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini", input: "Sag nur: ok" });
  console.log("OpenAI ok:", r.output_text);
} catch (e) {
  console.log("OpenAI-Fehler:", e.status, e.message);
  process.exitCode = 1;
}
