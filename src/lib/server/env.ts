import "server-only";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt (siehe .env.example)`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get openaiApiKey() {
    return required("OPENAI_API_KEY", process.env.OPENAI_API_KEY);
  },
  /** Starkes Modell für Bilder (Kassenzettel, Teller) und die Zuordnung */
  get openaiModel() {
    return process.env.OPENAI_MODEL || "gpt-5.5";
  },
  /** Schnelles Modell für kurze Chat-Nachrichten */
  get openaiModelFast() {
    return process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini";
  },
  /** AI_MOCK=1: deterministische Fake-KI für Tests ohne OpenAI */
  get aiMock() {
    return process.env.AI_MOCK === "1";
  },
};
