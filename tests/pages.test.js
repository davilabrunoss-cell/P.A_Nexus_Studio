import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/[[path]].js";
import { onRequest as onUpload } from "../functions/uploads/[[path]].js";

test("Pages encaminha API com sessão e preserva redirecionamento de mídia", async () => {
  const originalFetch = globalThis.fetch;
  let received;
  globalThis.fetch = async (request) => {
    received = request;
    return new Response(null, { status: 302,
      headers: { Location: "https://example.supabase.co/signed-media" } });
  };
  try {
    const request = new Request("https://pa-nexus-studio.pages.dev/api/media?id=1", {
      headers: { Cookie: "nexus=abc" }
    });
    const response = await onRequest({ request,
      env: { BACKEND_ORIGIN: "https://pa-nexus-studio.onrender.com" } });
    assert.equal(received.url, "https://pa-nexus-studio.onrender.com/api/media?id=1");
    assert.equal(received.headers.get("cookie"), "nexus=abc");
    assert.equal(received.redirect, "manual");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://example.supabase.co/signed-media");
  } finally { globalThis.fetch = originalFetch; }
  assert.equal((await onRequest({ request: new Request("https://pa-nexus-studio.pages.dev/api/health"),
    env: {} })).status, 503);
  assert.equal(onUpload, onRequest);
});
