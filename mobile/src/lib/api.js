export async function apiRequest(baseUrl, path, { method = "GET", token, body } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (_) {
    throw new Error("No fue posible conectar con el servidor. Verifica la URL configurada y que la API este publicada.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "No fue posible completar la solicitud.");
  }
  return payload;
}
