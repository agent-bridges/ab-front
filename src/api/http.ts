export async function readJson<T>(res: Response, fallback: T): Promise<T> {
  try {
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function throwFromResponse(res: Response, fallbackMessage: string): Promise<never> {
  const data = await readJson<Record<string, unknown>>(res, {});
  const message =
    (typeof data.error === 'string' && data.error) ||
    (typeof data.detail === 'string' && data.detail) ||
    `${fallbackMessage}: ${res.status}`;
  throw new Error(message);
}

export async function readJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    await throwFromResponse(res, fallbackMessage);
  }
  return readJson<T>(res, {} as T);
}
