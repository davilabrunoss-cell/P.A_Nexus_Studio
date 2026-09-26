import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";

const database = newDb();
database.public.none(readFileSync("database/cloud.sql", "utf8").split("DO $$")[0]);
const { Pool } = database.adapters.createPg();
globalThis.nexusTestPool = new Pool();
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://test:test@localhost/test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SECRET_KEY = "test-secret";
process.env.STUDIO_EMAIL = "studio@example.test";
process.env.STUDIO_PASSWORD = "strong-test-password";
const { app } = await import("../server-cloud.js");
const nativeFetch = globalThis.fetch;
let server, base, cookie, profileId;
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await globalThis.nexusTestPool.end();
});
async function request(url, method = "GET", data) {
  const r = await nativeFetch(base + url, { method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie, "X-Profile-Id": profileId } : {}) },
    body: data ? JSON.stringify(data) : undefined });
  return { status: r.status, data: await r.json(), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
test("backend publicado registra espectador, restringe produtora e agenda catálogo", async () => {
  assert.equal((await request("/api/health")).status, 200);
  const registered = await request("/api/register", "POST", {
    name: "Espectador", email: "viewer@example.test", password: "viewer-pass-2026"
  });
  assert.equal(registered.status, 200);
  assert.equal(registered.data.user.role, "viewer");
  cookie = registered.cookie;
  profileId = registered.data.profiles[0].id;
  assert.equal((await request("/api/studio/projects")).status, 403);
  await globalThis.nexusTestPool.query("UPDATE nexus_users SET role='producer' WHERE email=$1", ["viewer@example.test"]);
  const created = await request("/api/studio/projects", "POST", {
    title: "Noite no bosque", genres: ["Terror", "Mistério"],
    scheduledDate: "2020-01-01", seasons: 1, episodes: 1
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.deepEqual(created.data.genres, ["Terror", "Mistério"]);
  assert.equal((await request("/api/catalog")).data.length, 0);
  const episodeId = created.data.seasons[0].episodes[0].id;
  assert.equal((await request("/api/studio/episodes/" + episodeId, "PUT", {
    video: "/assets/demo.mp4"
  })).status, 200);
  const catalog = await request("/api/catalog");
  assert.equal(catalog.status, 200, JSON.stringify(catalog.data));
  assert.equal(catalog.data[0].id, created.data.id);
  assert.deepEqual(catalog.data[0].genres, ["Terror", "Mistério"]);
  assert.ok(catalog.data[0].releaseDate);
  assert.equal((await request("/api/studio/episodes/" + episodeId, "PUT", { video: "" })).status, 200);
  assert.equal((await request("/api/catalog")).data.length, 0);
});
test("upload na nuvem usa bucket privado e entrega URL temporária", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(process.env.SUPABASE_URL)) {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify(String(url).includes("/sign/")
        ? { signedURL: "/storage/v1/object/sign/nexus-media/test.png?token=ok" }
        : { Key: "test.png" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return nativeFetch(url, options);
  };
  try {
    const form = new FormData();
    form.append("file", new Blob([readFileSync("public/assets/aurora.png")], { type: "image/png" }), "aurora.png");
    const response = await nativeFetch(base + "/api/studio/upload?kind=image", {
      method: "POST", headers: { Cookie: cookie }, body: form
    });
    assert.equal(response.status, 201);
    const { url } = await response.json();
    assert.match(url, /^\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal(calls[0].options.headers.apikey, "test-secret");
    assert.equal(calls[0].options.headers.Authorization, undefined);
    const redirect = await nativeFetch(base + url, { headers: { Cookie: cookie }, redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.match(redirect.headers.get("location"), /\/storage\/v1\/object\/sign\//);
  } finally { globalThis.fetch = nativeFetch; }
});
