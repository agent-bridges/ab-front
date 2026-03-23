export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.headers as Record<string, string> || {}),
    },
  });
}
