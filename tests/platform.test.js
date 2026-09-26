import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const dir = mkdtempSync(path.join(tmpdir(), "nexus-test-"));
const port = 33219,
  base = `http://127.0.0.1:${port}`;
let child,
  producerCookie,
  viewerCookie,
  profileId,
  projectId,
  seasonId,
  episodeId,
  imageUrl,
  videoUrl;
async function req(url, method = "GET", body, cookie = "", profile = "") {
  const r = await fetch(base + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      Cookie: cookie,
      "X-Profile-Id": profile,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {}
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  const legacy = new DatabaseSync(path.join(dir, "nexus.sqlite"));
  legacy.exec(`CREATE TABLE projects(id TEXT PRIMARY KEY,title TEXT,description TEXT,genre TEXT,rating TEXT,year INTEGER,cover TEXT,banner TEXT,status TEXT DEFAULT 'draft',featured INTEGER DEFAULT 0,demo INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO projects(id,title,description,genre,rating,year,cover,banner) VALUES('legacy','Projeto antigo','','Terror','L',2025,'','');`);
  legacy.close();
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stderr.on("data", (d) => (logs += d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(logs || "Servidor não iniciou")),
      15000,
    );
    child.stdout.on("data", (d) => {
      if (d.toString().includes("http")) {
        clearTimeout(t);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`Servidor saiu ${code}: ${logs}`));
    });
  });
});
after(async () => {
  child?.kill();
  await new Promise((resolve) => {
    if (child?.exitCode !== null) resolve();
    else child?.once("exit", resolve);
  });
  rmSync(dir, { recursive: true, force: true });
});
test("catálogo inicial tem quatro séries completas e streaming aceita intervalos", async () => {
  const r = await req("/api/catalog");
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 4);
  assert.equal(r.data[0].seasons[0].episodes.length, 3);
  const v = await fetch(base + "/assets/demo.mp4", {
    headers: { Range: "bytes=0-1023" },
  });
  assert.equal(v.status, 206);
  assert.equal((await v.arrayBuffer()).byteLength, 1024);
});
test("visitante não consegue administrar ou enviar arquivos", async () => {
  assert.equal((await req("/api/studio/projects")).status, 403);
  assert.equal((await req("/api/studio/upload", "POST", {})).status, 403);
});
test("login valida senha e cria sessão de produtora", async () => {
  assert.equal(
    (
      await req("/api/login", "POST", {
        email: "studio@panexus.local",
        password: "errada",
      })
    ).status,
    401,
  );
  const r = await req("/api/login", "POST", {
    email: "studio@panexus.local",
    password: "NexusStudio@2026",
    area: "studio",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, "producer");
  producerCookie = r.cookie;
  const migrated = (await req("/api/studio/projects", "GET", null, producerCookie)).data.find((p) => p.id === "legacy");
  assert.deepEqual(migrated.genres, ["Terror"]);
  assert.equal(migrated.releaseDate, null);
});
test("criador administra membros e também assiste com perfil próprio", async () => {
  const creatorViewer = await req("/api/login", "POST", { email: "studio@panexus.local", password: "NexusStudio@2026", area: "viewer" });
  assert.equal(creatorViewer.status, 200);
  assert.equal(creatorViewer.data.user.role, "producer");
  const creatorProfile = creatorViewer.data.profiles[0].id;
  assert.equal((await req("/api/library", "GET", null, producerCookie, creatorProfile)).status, 200);
  assert.equal((await req("/api/favorites/aurora", "PUT", {saved:true}, producerCookie, creatorProfile)).status, 200);
  assert.equal((await req("/api/library", "GET", null, producerCookie, creatorProfile)).data.favorites.includes("aurora"), true);
  const made = await req("/api/studio/members", "POST", {
    name: "Artista", email: "artista@example.local", password: "Segura@2026", role: "producer"
  }, producerCookie);
  assert.equal(made.status, 201);
  assert.equal(made.data.role, "producer");
  assert.equal("password" in made.data, false);
  const artistViewer = await req("/api/login", "POST", { email: "artista@example.local", password: "Segura@2026", area: "viewer" });
  assert.equal(artistViewer.status, 200);
  assert.equal(artistViewer.data.profiles.length, 1);
  const creatorLogin = await req("/api/login", "POST", { email: "artista@example.local", password: "Segura@2026", area: "studio" });
  assert.equal(creatorLogin.status, 200);
  assert.equal((await req("/api/studio/members", "GET", null, creatorLogin.cookie)).status, 200);
  assert.equal((await req("/api/studio/members/" + made.data.id, "PUT", {role:"viewer"}, creatorLogin.cookie)).status, 403);
  const changed = await req("/api/studio/members/" + made.data.id, "PUT", {role:"viewer"}, producerCookie);
  assert.equal(changed.status, 200);
  assert.equal((await req("/api/studio/members", "GET", null, creatorLogin.cookie)).status, 403);
  assert.equal((await req("/api/login", "POST", { email: "artista@example.local", password: "Segura@2026", area: "studio" })).status, 403);
  const viewerLogin = await req("/api/login", "POST", { email: "artista@example.local", password: "Segura@2026", area: "viewer" });
  assert.equal(viewerLogin.status, 200);
  assert.equal(viewerLogin.data.profiles.length, 1);
});
test("cadastro de usuário, perfis e isolamento de acesso", async () => {
  const r = await req("/api/register", "POST", {
    name: "Teste",
    email: "teste@example.local",
    password: "TesteSeguro@2026",
    role: "producer",
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.role, "viewer");
  viewerCookie = r.cookie;
  profileId = r.data.profiles[0].id;
  assert.equal(
    (await req("/api/studio/projects", "GET", null, viewerCookie)).status,
    403,
  );
  assert.equal(
    (await req("/api/library", "GET", null, viewerCookie, "invalid-profile"))
      .status,
    403,
  );
  assert.equal(
    (
      await req("/api/register", "POST", {
        name: "Outro",
        email: "teste@example.local",
        password: "TesteSeguro@2026",
      })
    ).status,
    409,
  );
});
test("criação em lote de temporadas e episódios e rascunho invisível", async () => {
  const r = await req(
    "/api/studio/projects",
    "POST",
    { title: "Projeto de teste", seasons: 2, episodes: 3 },
    producerCookie,
  );
  assert.equal(r.status, 201);
  projectId = r.data.id;
  seasonId = r.data.seasons[0].id;
  episodeId = r.data.seasons[0].episodes[0].id;
  assert.equal(r.data.seasons.length, 2);
  assert.equal(r.data.seasons[1].episodes.length, 3);
  assert(!(await req("/api/catalog")).data.some((p) => p.id === projectId));
  assert.equal(
    (
      await req(
        "/api/studio/projects/" + projectId,
        "PUT",
        { status: "published" },
        producerCookie,
      )
    ).status,
    400,
  );
});
test("vários gêneros e datas são editáveis; publicação programada exige vídeo", async () => {
  const created = await req("/api/studio/projects", "POST", {
    title: "Mistério da noite", genres: ["Terror", "Mistério"],
    releaseDate: "2027-10-31", scheduledDate: "2020-01-01",
  }, producerCookie);
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.genres, ["Terror", "Mistério"]);
  assert.equal(created.data.year, 2027);
  assert.equal(created.data.releaseDate, "2027-10-31");
  assert.equal((await req("/api/catalog")).data.some((p) => p.id === created.data.id), false);
  const updated = await req("/api/studio/projects/" + created.data.id, "PUT", {
    genres: ["Terror", "Suspense"], releaseDate: "2028-02-29",
  }, producerCookie);
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.data.genres, ["Terror", "Suspense"]);
  assert.equal(updated.data.year, 2028);
  assert.equal((await req("/api/studio/projects/" + created.data.id, "PUT", {
    releaseDate: "2027-02-29",
  }, producerCookie)).status, 400);
  await req("/api/studio/episodes/" + created.data.seasons[0].episodes[0].id,
    "PUT", {video: "/assets/demo.mp4"}, producerCookie);
  const catalog = await req("/api/catalog");
  assert.equal(catalog.data.find((p) => p.id === created.data.id).status, "published");
  assert.deepEqual(catalog.data.find((p) => p.id === created.data.id).genres, ["Terror", "Suspense"]);
});
test("upload rejeita arquivo forjado e aceita imagem real e vídeo real", async () => {
  const fake = new FormData();
  fake.append(
    "file",
    new Blob(["<script>alert(1)</script>"], { type: "image/png" }),
    "capa.png",
  );
  assert.equal(
    (
      await fetch(base + "/api/studio/upload?kind=image", {
        method: "POST",
        headers: { Cookie: producerCookie },
        body: fake,
      })
    ).status,
    400,
  );
  for (const [filename, kind] of [
    ["brand.jpeg", "image"],
    ["demo.mp4", "video"],
  ]) {
    const data = new FormData();
    data.append(
      "file",
      new Blob([readFileSync("public/assets/" + filename)]),
      filename,
    );
    const r = await fetch(base + "/api/studio/upload?kind=" + kind, {
      method: "POST",
      headers: { Cookie: producerCookie },
      body: data,
    });
    assert.equal(r.status, 201);
    const d = await r.json();
    if (kind === "image") imageUrl = d.url;
    else videoUrl = d.url;
  }
  assert.equal((await fetch(base + videoUrl)).status, 404);
});
test("salvar capas, publicar desenho e reproduzir vídeo enviado", async () => {
  assert.equal(
    (
      await req(
        "/api/studio/seasons/" + seasonId,
        "PUT",
        { title: "Temporada de teste", cover: imageUrl },
        producerCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "/api/studio/episodes/" + episodeId,
        "PUT",
        { title: "Piloto", cover: imageUrl, video: videoUrl, duration: 12 },
        producerCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "/api/studio/projects/" + projectId,
        "PUT",
        {
          cover: imageUrl,
          banner: imageUrl,
          status: "published",
          featured: true,
        },
        producerCookie,
      )
    ).status,
    200,
  );
  const p = (await req("/api/catalog")).data.find((p) => p.id === projectId);
  assert.equal(p.seasons[0].episodes[0].video, videoUrl);
  const r = await fetch(base + videoUrl, {
    headers: { Range: "bytes=100-399" },
  });
  assert.equal(r.status, 206);
  assert.equal((await r.arrayBuffer()).byteLength, 300);
});
test("lista pessoal e progresso persistem e ficam isolados entre perfis", async () => {
  assert.equal(
    (
      await req(
        "/api/favorites/" + projectId,
        "PUT",
        { saved: true },
        viewerCookie,
        profileId,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        "/api/progress/" + episodeId,
        "PUT",
        { seconds: 5, duration: 12 },
        viewerCookie,
        profileId,
      )
    ).status,
    200,
  );
  let r = await req("/api/library", "GET", null, viewerCookie, profileId);
  assert(r.data.favorites.includes(projectId));
  assert.equal(r.data.progress[0].seconds, 5);
  const other = await req(
    "/api/profiles",
    "POST",
    { name: "Outro perfil", color: "coral" },
    viewerCookie,
  );
  assert.equal(other.status, 200);
  r = await req("/api/library", "GET", null, viewerCookie, other.data.id);
  assert.deepEqual(r.data.favorites, []);
  assert.deepEqual(r.data.progress, []);
});
test("rejeita CSRF, caminhos externos e progressos inválidos", async () => {
  const r = await fetch(base + "/api/logout", {
    method: "POST",
    headers: { Origin: "https://evil.example", Cookie: viewerCookie },
  });
  assert.equal(r.status, 403);
  assert.equal(
    (
      await req(
        "/api/studio/projects/" + projectId,
        "PUT",
        { cover: "https://evil.example/a.svg" },
        producerCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/api/progress/" + episodeId,
        "PUT",
        { seconds: -1, duration: 12 },
        viewerCookie,
        profileId,
      )
    ).status,
    400,
  );
});
test("capas de desenho, temporadas e episódio permanecem independentes", async () => {
  const p = (
    await req("/api/studio/projects", "GET", null, producerCookie)
  ).data.find((p) => p.id === projectId);
  const second = p.seasons[1].id;
  await req(
    "/api/studio/seasons/" + seasonId,
    "PUT",
    { cover: "/assets/orbita.png" },
    producerCookie,
  );
  await req(
    "/api/studio/seasons/" + second,
    "PUT",
    { cover: "/assets/bosque.png" },
    producerCookie,
  );
  await req(
    "/api/studio/episodes/" + episodeId,
    "PUT",
    { cover: "/assets/aurora.png" },
    producerCookie,
  );
  await req(
    "/api/studio/projects/" + projectId,
    "PUT",
    { cover: "/assets/neon.png" },
    producerCookie,
  );
  // A partial title save must not erase an existing season cover.
  await req(
    "/api/studio/seasons/" + seasonId,
    "PUT",
    { title: "Título atualizado" },
    producerCookie,
  );
  let saved = (await req("/api/catalog")).data.find((p) => p.id === projectId);
  assert.equal(saved.cover, "/assets/neon.png");
  assert.equal(saved.seasons[0].cover, "/assets/orbita.png");
  assert.equal(saved.seasons[1].cover, "/assets/bosque.png");
  assert.equal(saved.seasons[0].episodes[0].cover, "/assets/aurora.png");
  await req(
    "/api/studio/seasons/" + seasonId,
    "PUT",
    { cover: "/assets/brand.jpeg" },
    producerCookie,
  );
  saved = (await req("/api/catalog")).data.find((p) => p.id === projectId);
  assert.equal(saved.cover, "/assets/neon.png");
  assert.equal(saved.seasons[0].cover, "/assets/brand.jpeg");
  assert.equal(saved.seasons[1].cover, "/assets/bosque.png");
});
test("mídia deve existir e destaque escolhido substitui o anterior", async () => {
  assert.equal(
    (
      await req(
        "/api/studio/episodes/" + episodeId,
        "PUT",
        { video: "/uploads/missing.mp4" },
        producerCookie,
      )
    ).status,
    400,
  );
  const catalog = (await req("/api/catalog")).data;
  assert.equal(catalog.filter((p) => p.featured).length, 1);
  assert.equal(catalog[0].id, projectId);
});
test("remover o último vídeo retorna automaticamente para rascunho", async () => {
  assert.equal(
    (
      await req(
        "/api/studio/episodes/" + episodeId,
        "PUT",
        { video: "" },
        producerCookie,
      )
    ).status,
    200,
  );
  assert(!(await req("/api/catalog")).data.some((p) => p.id === projectId));
  await req(
    "/api/studio/episodes/" + episodeId,
    "PUT",
    { video: videoUrl },
    producerCookie,
  );
  await req(
    "/api/studio/projects/" + projectId,
    "PUT",
    { status: "published" },
    producerCookie,
  );
});
test("exclusão do projeto limpa temporadas, episódios e lista por cascata", async () => {
  assert.equal(
    (
      await req(
        "/api/studio/projects/" + projectId,
        "DELETE",
        null,
        producerCookie,
      )
    ).status,
    200,
  );
  assert(!(await req("/api/catalog")).data.some((p) => p.id === projectId));
  const r = await req("/api/library", "GET", null, viewerCookie, profileId);
  assert(!r.data.favorites.includes(projectId));
  assert(!r.data.progress.some((x) => x.episodeId === episodeId));
  assert.equal((await fetch(base + videoUrl)).status, 404);
});
test("logout invalida sessão", async () => {
  assert.equal(
    (await req("/api/logout", "POST", {}, viewerCookie)).status,
    200,
  );
  assert.equal(
    (await req("/api/library", "GET", null, viewerCookie, profileId)).status,
    401,
  );
});
