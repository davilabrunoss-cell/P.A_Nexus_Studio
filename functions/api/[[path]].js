// Keep the Pages address as the browser's only origin while the Node API runs on Render.
export async function onRequest({ request, env }) {
  if (!env.BACKEND_ORIGIN) {
    return Response.json({ error: "Serviço temporariamente indisponível." }, { status: 503 });
  }
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.BACKEND_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const upstream = new Request(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual"
  });
  try {
    return await fetch(upstream);
  } catch {
    return Response.json({ error: "Serviço temporariamente indisponível." }, { status: 503 });
  }
}
