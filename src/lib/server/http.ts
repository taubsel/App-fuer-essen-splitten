import "server-only";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: "Da ist etwas schiefgelaufen. Bitte nochmal versuchen." }, { status: 500 });
}

/** Wrapper für Route-Handler: fängt Fehler ab und liefert JSON. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return jsonError(err);
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Ungültige Anfrage");
  }
}

export function str(value: unknown, field: string, { min = 1, max = 500 } = {}): string {
  if (typeof value !== "string") throw new HttpError(400, `${field} fehlt`);
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `${field} fehlt`);
  if (v.length > max) throw new HttpError(400, `${field} ist zu lang`);
  return v;
}

export function num(value: unknown, field: string, { min = -Infinity, max = Infinity } = {}): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new HttpError(400, `${field} ist keine Zahl`);
  if (n < min || n > max) throw new HttpError(400, `${field} ist außerhalb des erlaubten Bereichs`);
  return n;
}
