import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { env } from "@/lib/server/env";

let client: OpenAI | null = null;

function openai(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: env.openaiApiKey, timeout: 120_000, maxRetries: 1 });
  return client;
}

export type ImageInput = { dataUrl: string };

export async function structured<T extends z.ZodType>(opts: {
  model: string;
  effort: "minimal" | "low" | "medium" | "high";
  system: string;
  user: string;
  images?: ImageInput[];
  schema: T;
  name: string;
}): Promise<z.infer<T>> {
  const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: opts.user }];
  for (const img of opts.images ?? []) {
    content.push({ type: "input_image", image_url: img.dataUrl, detail: "high" });
  }
  const started = Date.now();
  const res = await openai().responses.parse({
    model: opts.model,
    reasoning: { effort: opts.effort },
    input: [
      { role: "system", content: opts.system },
      { role: "user", content },
    ],
    text: { format: zodTextFormat(opts.schema, opts.name) },
  });
  if (process.env.AI_DEBUG === "1") {
    console.log(`[ai] ${opts.name} ${opts.model} ${Date.now() - started}ms`, JSON.stringify(res.output_parsed));
  }
  if (!res.output_parsed) throw new Error(`KI hat keine gültige Antwort geliefert (${opts.name})`);
  return res.output_parsed as z.infer<T>;
}
