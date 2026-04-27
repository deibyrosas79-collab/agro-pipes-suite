const runtimeBaseUrl =
  typeof window !== "undefined" && window.location?.origin
    ? `${window.location.origin}/api`
    : "http://localhost:5000/api";

const BASE_URL = import.meta.env.VITE_API_URL || runtimeBaseUrl;

export function getApiUrl() {
  return BASE_URL;
}

export async function apiRequest(path, { method = "GET", token = null, body = null, params = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let url = `${BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)));
    if (qs.toString()) url += `?${qs}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = { error: `Error del servidor (${response.status})` };
  }

  if (!response.ok) {
    throw new Error(data?.error || `Error ${response.status}`);
  }

  return data;
}
