"use client";

import { accessToken } from "./supabase";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) headers.Authorization = `Bearer ${await accessToken()}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
  return data as T;
}
