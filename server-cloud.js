import express from "express";
import multer from "multer";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
for (const key of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "STUDIO_EMAIL", "STUDIO_PASSWORD"])
  if (!process.env[key]) throw new Error(`Variável ${key} obrigatória para publicação.`);
if (process.env.STUDIO_PASSWORD.length < 12) throw new Error("STUDIO_PASSWORD deve ter pelo menos 12 caracteres.");
const pool = process.env.NODE_ENV === "test" && globalThis.nexusTestPool
  ? globalThis.nexusTestPool
  : new Pool({ connectionString: process.env.DATABASE_URL, max: 4,
    ssl: { ca: readFileSync(path.join(ROOT, "database", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true } });
const q = async (sql, args = [], client = pool) => (await client.query(sql, args)).rows;
const one = async (sql, args = [], client = pool) => (await q(sql, args, client))[0];
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const number = (v, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`Informe um número entre ${min} e ${max}.`);
  return n;
};
const dateOf = (v) => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail("Informe uma data válida.");
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== v) fail("Informe uma data válida.");
  return v;
};
const genresOf = (v) => {
  if (!Array.isArray(v) || v.length < 1 || v.length > 12) fail("Selecione de 1 a 12 gêneros.");
  const values = [...new Set(v.map((x) => str(x, 40)))];
  if (values.some((x) => !x)) fail("Gênero inválido.");
  return values;
};
const hash = (password, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const check = (password, stored) => {
  const [salt, digest] = stored.split(":");
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(digest, "hex"), candidate);
};
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const clean = (row) => row && {
  ...row,
  releaseDate: row.releaseDate ? new Date(row.releaseDate).toISOString().slice(0, 10) : null,
  scheduledDate: row.scheduledDate ? new Date(row.scheduledDate).toISOString().slice(0, 10) : null
};
async function due() {
  const day = today();
  const candidates = await q('SELECT id FROM nexus_projects WHERE status=\'draft\' AND "scheduledDate"<=$1::date', [day]);
  for (const item of candidates) {
    if (!await one(`SELECT e.id FROM nexus_seasons s JOIN nexus_episodes e ON e."seasonId"=s.id
      WHERE s."projectId"=$1 AND e.video<>'' LIMIT 1`, [item.id])) continue;
    await q(`UPDATE nexus_projects SET status='published',
      "releaseDate"=COALESCE("releaseDate",$1::date),
      year=CASE WHEN "releaseDate" IS NULL THEN EXTRACT(YEAR FROM $1::date)::integer ELSE year END
      WHERE id=$2 AND status='draft'`, [day, item.id]);
  }
}
async function required(table, id, label) {
  const row = await one(`SELECT * FROM ${table} WHERE id=$1`, [id]);
  if (!row) fail(`${label} não encontrado.`, 404);
  return row;
}
const project = (id) => required("nexus_projects", id, "Projeto");
const season = (id) => required("nexus_seasons", id, "Temporada");
const episode = (id) => required("nexus_episodes", id, "Episódio");
async function full(p) {
  const seasons = await q('SELECT * FROM nexus_seasons WHERE "projectId"=$1 ORDER BY number', [p.id]);
  for (const s of seasons)
    s.episodes = await q('SELECT * FROM nexus_episodes WHERE "seasonId"=$1 ORDER BY number', [s.id]);
  return { ...clean(p), seasons };
}
async function fullList(rows) { return Promise.all(rows.map(full)); }
async function unpublishEmpty(id) {
  await q(`UPDATE nexus_projects SET status='draft' WHERE id=$1 AND NOT EXISTS(
    SELECT 1 FROM nexus_seasons s JOIN nexus_episodes e ON e."seasonId"=s.id
    WHERE s."projectId"=$1 AND e.video<>'')`, [id]);
}
const media = (v, kind = "image") => {
  if (!v) return "";
  if (typeof v !== "string" || !/^\/(assets|uploads)\/[a-zA-Z0-9_.-]+$/.test(v))
    fail("Arquivo inválido.");
  if (!(kind === "video" ? /\.(mp4|webm)$/i : /\.(png|jpe?g|webp)$/i).test(v))
    fail("Arquivo de tipo incorreto.");
  return v;
};
const storageUrl = (suffix) => `${process.env.SUPABASE_URL}/storage/v1/${suffix}`;
const storageHeaders = () => ({ apikey: process.env.SUPABASE_SECRET_KEY });

export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  const allowedOrigins = [`${req.protocol}://${req.get("host")}`];
  if (process.env.PUBLIC_ORIGIN) allowedOrigins.push(process.env.PUBLIC_ORIGIN.replace(/\/$/, ""));
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin &&
      !allowedOrigins.includes(req.headers.origin))
    return res.status(403).json({ error: "Origem não autorizada." });
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => { (async () => {
  const token = req.headers.cookie?.split(";").map((s) => s.trim())
    .find((s) => s.startsWith("nexus="))?.slice(6);
  req.token = token;
  req.user = token ? await one(`SELECT u.id,u.name,u.email,u.role FROM nexus_sessions s
    JOIN nexus_users u ON u.id=s."userId" WHERE s.token=$1 AND s.expires>$2`,
    [token, Date.now()]) : null;
})().then(() => next()).catch(next); });
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: "Entre na sua conta para continuar." });
const producer = (req, res, next) => req.user?.role === "producer" ? next() : res.status(403).json({ error: "Acesso exclusivo da produtora." });
const viewer = (req, res, next) => !req.user ? auth(req, res, next) : req.user.role === "viewer" ? next() : res.status(403).json({ error: "Acesso exclusivo de telespectadores." });
async function profile(req) {
  const id = req.headers["x-profile-id"] || "";
  if (!await one('SELECT id FROM nexus_profiles WHERE id=$1 AND "userId"=$2', [id, req.user.id]))
    fail("Selecione um perfil válido.", 403);
  return id;
}
async function session(res, user) {
  const token = randomBytes(32).toString("hex");
  await q("DELETE FROM nexus_sessions WHERE expires<$1", [Date.now()]);
  await q('INSERT INTO nexus_sessions(token,"userId",expires) VALUES($1,$2,$3)',
    [token, user.id, Date.now() + 7 * 86400000]);
  res.cookie("nexus", token, { httpOnly: true, secure: true, sameSite: "strict", maxAge: 7 * 86400000 });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role },
    profiles: await q('SELECT * FROM nexus_profiles WHERE "userId"=$1', [user.id]) });
}
const attempts = new Map();
app.post("/api/login", route(async (req, res) => {
  const key = req.ip;
  const a = attempts.get(key) || { count: 0, until: Date.now() + 60000 };
  if (Date.now() > a.until) { a.count = 0; a.until = Date.now() + 60000; }
  a.count++; attempts.set(key, a);
  if (a.count > 20) fail("Muitas tentativas. Aguarde um minuto.", 429);
  const u = await one("SELECT * FROM nexus_users WHERE email=$1", [str(req.body.email).toLowerCase()]);
  if (!u || !check(str(req.body.password, 200), u.password)) fail("E-mail ou senha incorretos.", 401);
  const area = req.body.area || "viewer";
  if (!["viewer", "studio"].includes(area)) fail("Área de acesso inválida.");
  if (u.role !== (area === "studio" ? "producer" : "viewer"))
    fail(area === "studio" ? "Esta conta não tem acesso à criação." : "Use a entrada da produtora para esta conta.", 403);
  attempts.delete(key);
  await session(res, u);
}));
app.post("/api/register", route(async (req, res) => {
  const name = str(req.body.name, 40), email = str(req.body.email).toLowerCase(),
    password = str(req.body.password, 200);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    fail("Preencha o nome, um e-mail válido e uma senha com ao menos 8 caracteres.");
  const id = randomUUID();
  try {
    await q("INSERT INTO nexus_users(id,name,email,password,role) VALUES($1,$2,$3,$4,'viewer')",
      [id, name, email, hash(password)]);
  } catch (e) { if (e.code === "23505") fail("Este e-mail já está cadastrado.", 409); throw e; }
  await q('INSERT INTO nexus_profiles(id,"userId",name,color) VALUES($1,$2,$3,$4)',
    [randomUUID(), id, name, "violet"]);
  await session(res, { id, name, email, role: "viewer" });
}));
app.get("/api/session", route(async (req, res) => res.json({
  user: req.user || null,
  profiles: req.user ? await q('SELECT * FROM nexus_profiles WHERE "userId"=$1', [req.user.id]) : []
})));
app.post("/api/logout", auth, route(async (req, res) => {
  await q("DELETE FROM nexus_sessions WHERE token=$1", [req.token]);
  res.clearCookie("nexus"); res.json({ ok: true });
}));
app.post("/api/profiles", viewer, route(async (req, res) => {
  const existing = await q('SELECT id FROM nexus_profiles WHERE "userId"=$1', [req.user.id]);
  if (existing.length >= 5) fail("Você pode criar até 5 perfis.");
  const name = str(req.body.name, 24);
  if (!name) fail("Dê um nome ao perfil.");
  const id = randomUUID();
  await q('INSERT INTO nexus_profiles(id,"userId",name,color) VALUES($1,$2,$3,$4)',
    [id, req.user.id, name, ["violet","coral","mint","blue"].includes(req.body.color) ? req.body.color : "violet"]);
  res.json(await one("SELECT * FROM nexus_profiles WHERE id=$1", [id]));
}));
app.get("/api/health", route(async (req, res) => {
  await q("SELECT 1"); res.json({ ok: true });
}));
app.get("/api/catalog", route(async (req, res) => {
  await due();
  res.json(await fullList(await q("SELECT * FROM nexus_projects WHERE status='published' ORDER BY featured DESC,created DESC")));
}));
app.get("/api/library", viewer, route(async (req, res) => {
  const id = await profile(req);
  res.json({
    favorites: (await q('SELECT "projectId" FROM nexus_favorites WHERE "profileId"=$1', [id])).map((x) => x.projectId),
    progress: await q('SELECT * FROM nexus_progress WHERE "profileId"=$1 ORDER BY updated DESC', [id])
  });
}));
app.put("/api/favorites/:id", viewer, route(async (req, res) => {
  const id = await profile(req);
  if ((await project(req.params.id)).status !== "published") fail("Desenho indisponível.", 404);
  if (req.body.saved)
    await q('INSERT INTO nexus_favorites("profileId","projectId") VALUES($1,$2) ON CONFLICT DO NOTHING', [id, req.params.id]);
  else await q('DELETE FROM nexus_favorites WHERE "profileId"=$1 AND "projectId"=$2', [id, req.params.id]);
  res.json({ ok: true });
}));
app.put("/api/progress/:id", viewer, route(async (req, res) => {
  const id = await profile(req), e = await episode(req.params.id);
  if ((await project((await season(e.seasonId)).projectId)).status !== "published")
    fail("Episódio indisponível.", 404);
  const seconds = Number(req.body.seconds), duration = Number(req.body.duration);
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || seconds < 0 || duration <= 0)
    fail("Progresso inválido.");
  await q(`INSERT INTO nexus_progress("profileId","episodeId",seconds,duration) VALUES($1,$2,$3,$4)
    ON CONFLICT("profileId","episodeId") DO UPDATE SET seconds=EXCLUDED.seconds,
      duration=EXCLUDED.duration,updated=now()`, [id, e.id, Math.min(seconds, duration), duration]);
  res.json({ ok: true });
}));
app.get("/api/studio/members", producer, route(async (req, res) => {
  res.json(await q("SELECT id,name,email,role FROM nexus_users ORDER BY name,email"));
}));
app.post("/api/studio/members", producer, route(async (req, res) => {
  const name = str(req.body.name, 40), email = str(req.body.email).toLowerCase();
  const password = str(req.body.password, 200), role = req.body.role;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    fail("Preencha o nome, um e-mail válido e uma senha com ao menos 8 caracteres.");
  if (!["viewer", "producer"].includes(role)) fail("Nível de acesso inválido.");
  const id = randomUUID(), client = await pool.connect();
  try {
    await client.query("BEGIN");
    await q("INSERT INTO nexus_users(id,name,email,password,role) VALUES($1,$2,$3,$4,$5)",
      [id, name, email, hash(password), role], client);
    if (role === "viewer") await q('INSERT INTO nexus_profiles(id,"userId",name,color) VALUES($1,$2,$3,$4)',
      [randomUUID(), id, name, "violet"], client);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") fail("Este e-mail já está cadastrado.", 409);
    throw e;
  } finally { client.release(); }
  res.status(201).json({ id, name, email, role });
}));
app.put("/api/studio/members/:id", producer, route(async (req, res) => {
  const role = req.body.role;
  if (!["viewer", "producer"].includes(role)) fail("Nível de acesso inválido.");
  if (req.params.id === req.user.id) fail("Você não pode alterar o próprio acesso.", 403);
  const client = await pool.connect();
  let member;
  try {
    await client.query("BEGIN");
    member = await one("SELECT id,name,email,role FROM nexus_users WHERE id=$1 FOR UPDATE", [req.params.id], client);
    if (!member) fail("Membro não encontrado.", 404);
    if (member.role !== role) {
      await q("UPDATE nexus_users SET role=$1 WHERE id=$2", [role, member.id], client);
      if (role === "viewer" && !await one('SELECT id FROM nexus_profiles WHERE "userId"=$1 LIMIT 1', [member.id], client))
        await q('INSERT INTO nexus_profiles(id,"userId",name,color) VALUES($1,$2,$3,$4)',
          [randomUUID(), member.id, member.name, "violet"], client);
      await q('DELETE FROM nexus_sessions WHERE "userId"=$1', [member.id], client);
      member.role = role;
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  res.json(member);
}));
app.get("/api/studio/projects", producer, route(async (req, res) => {
  await due();
  res.json(await fullList(await q("SELECT * FROM nexus_projects ORDER BY created DESC")));
}));
app.post("/api/studio/projects", producer, route(async (req, res) => {
  const title = str(req.body.title);
  if (!title) fail("Informe o nome do desenho.");
  const genres = genresOf(req.body.genres ?? [req.body.genre || "Aventura"]),
    releaseDate = dateOf(req.body.releaseDate), scheduledDate = dateOf(req.body.scheduledDate),
    count = number(req.body.seasons || 1, 1, 20), eps = number(req.body.episodes || 1, 1, 100),
    id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await q(`INSERT INTO nexus_projects(id,title,description,genre,genres,rating,year,"releaseDate","scheduledDate",cover,banner)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, str(req.body.description, 3000), genres[0], JSON.stringify(genres),
        str(req.body.rating) || "L", releaseDate ? Number(releaseDate.slice(0, 4)) : new Date().getFullYear(),
        releaseDate, scheduledDate, media(req.body.cover), media(req.body.banner)], client);
    for (let n = 1; n <= count; n++) {
      const sid = randomUUID();
      await q('INSERT INTO nexus_seasons(id,"projectId",number,title) VALUES($1,$2,$3,$4)',
        [sid, id, n, `Temporada ${n}`], client);
      for (let j = 1; j <= eps; j++)
        await q('INSERT INTO nexus_episodes(id,"seasonId",number,title) VALUES($1,$2,$3,$4)',
          [randomUUID(), sid, j, `Episódio ${j}`], client);
    }
    await client.query("COMMIT");
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
  res.status(201).json(await full(await project(id)));
}));
app.put("/api/studio/projects/:id", producer, route(async (req, res) => {
  const p = await project(req.params.id), b = { ...clean(p), ...req.body };
  if (!str(b.title)) fail("Informe o nome do desenho.");
  if (!["draft", "published"].includes(b.status)) fail("Status inválido.");
  const genres = genresOf(req.body.genres ?? (req.body.genre ? [req.body.genre] : p.genres));
  const releaseDate = dateOf(b.releaseDate);
  const scheduledDate = dateOf(req.body.status === "draft" && p.status === "published" &&
    !Object.hasOwn(req.body, "scheduledDate") ? null : b.scheduledDate);
  if (b.status === "published" && !await one(`SELECT e.id FROM nexus_episodes e JOIN nexus_seasons s
    ON s.id=e."seasonId" WHERE s."projectId"=$1 AND e.video<>'' LIMIT 1`, [p.id]))
    fail("Envie o vídeo de pelo menos um episódio antes de publicar.");
  await q(`UPDATE nexus_projects SET title=$1,description=$2,genre=$3,genres=$4,rating=$5,
    year=$6,"releaseDate"=$7,"scheduledDate"=$8,cover=$9,banner=$10,status=$11,featured=$12 WHERE id=$13`,
    [str(b.title), str(b.description, 3000), genres[0], JSON.stringify(genres), str(b.rating),
      releaseDate ? Number(releaseDate.slice(0, 4)) : p.year, releaseDate, scheduledDate,
      media(b.cover), media(b.banner), b.status, !!b.featured, p.id]);
  if (b.featured) await q("UPDATE nexus_projects SET featured=false WHERE id<>$1", [p.id]);
  res.json(await full(await project(p.id)));
}));
app.delete("/api/studio/projects/:id", producer, route(async (req, res) => {
  await project(req.params.id);
  await q("DELETE FROM nexus_projects WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
}));
app.post("/api/studio/projects/:id/seasons", producer, route(async (req, res) => {
  await project(req.params.id);
  const n = (await one('SELECT COALESCE(MAX(number),0)+1 AS n FROM nexus_seasons WHERE "projectId"=$1', [req.params.id])).n;
  const id = randomUUID();
  await q('INSERT INTO nexus_seasons(id,"projectId",number,title) VALUES($1,$2,$3,$4)',
    [id, req.params.id, n, `Temporada ${n}`]);
  res.status(201).json({ id });
}));
app.put("/api/studio/seasons/:id", producer, route(async (req, res) => {
  const s = await season(req.params.id);
  await q('UPDATE nexus_seasons SET title=$1,cover=$2 WHERE id=$3',
    [str(req.body.title) || s.title, Object.hasOwn(req.body,"cover") ? media(req.body.cover) : s.cover, s.id]);
  res.json({ ok: true });
}));
app.delete("/api/studio/seasons/:id", producer, route(async (req, res) => {
  const s = await season(req.params.id);
  await q("DELETE FROM nexus_seasons WHERE id=$1", [s.id]);
  await unpublishEmpty(s.projectId); res.json({ ok: true });
}));
app.post("/api/studio/seasons/:id/episodes", producer, route(async (req, res) => {
  await season(req.params.id);
  const n = (await one('SELECT COALESCE(MAX(number),0)+1 AS n FROM nexus_episodes WHERE "seasonId"=$1', [req.params.id])).n;
  const id = randomUUID();
  await q('INSERT INTO nexus_episodes(id,"seasonId",number,title) VALUES($1,$2,$3,$4)',
    [id, req.params.id, n, `Episódio ${n}`]);
  res.status(201).json({ id });
}));
app.put("/api/studio/episodes/:id", producer, route(async (req, res) => {
  const e = await episode(req.params.id), b = { ...e, ...req.body };
  if (!str(b.title)) fail("Informe o título do episódio.");
  await q(`UPDATE nexus_episodes SET title=$1,description=$2,cover=$3,video=$4,duration=$5 WHERE id=$6`,
    [str(b.title), str(b.description, 2000), media(b.cover), media(b.video, "video"),
      number(b.duration || 0, 0, 86400), e.id]);
  await unpublishEmpty((await season(e.seasonId)).projectId);
  res.json({ ok: true });
}));
app.delete("/api/studio/episodes/:id", producer, route(async (req, res) => {
  const e = await episode(req.params.id);
  await q("DELETE FROM nexus_episodes WHERE id=$1", [e.id]);
  await unpublishEmpty((await season(e.seasonId)).projectId);
  res.json({ ok: true });
}));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
app.post("/api/studio/upload", producer, upload.single("file"), route(async (req, res) => {
  const f = req.file;
  if (!f) fail("Escolha um arquivo.");
  const head = f.buffer.subarray(0, 16);
  let ext;
  if (head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = ".png";
  else if (head[0] === 255 && head[1] === 216 && head[2] === 255) ext = ".jpg";
  else if (head.toString("ascii",0,4) === "RIFF" && head.toString("ascii",8,12) === "WEBP") ext = ".webp";
  else if (head.toString("ascii",4,8) === "ftyp") ext = ".mp4";
  else if (head.subarray(0,4).equals(Buffer.from([26,69,223,163]))) ext = ".webm";
  else fail("Formato não suportado. Use JPG, PNG, WebP, MP4 ou WebM.");
  const video = ext === ".mp4" || ext === ".webm";
  if ((req.query.kind === "video") !== video) fail("Selecione o tipo correto de arquivo para este campo.");
  if (!video && f.size > 10 * 1024 * 1024) fail("A imagem deve ter até 10 MB.");
  const name = randomUUID() + ext;
  const mime = { ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp",
    ".mp4":"video/mp4", ".webm":"video/webm" }[ext];
  const response = await fetch(storageUrl(`object/nexus-media/${name}`), {
    method: "POST", headers: { ...storageHeaders(), "Content-Type": mime, "x-upsert": "false" }, body: f.buffer
  });
  if (!response.ok) { console.error("Storage upload:", response.status, await response.text()); fail("Falha ao armazenar arquivo.", 502); }
  res.status(201).json({ url: `/uploads/${name}` });
}));
app.get("/uploads/:name", route(async (req, res) => {
  const name = req.params.name;
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp|mp4|webm)$/i.test(name)) fail("Arquivo não encontrado.", 404);
  const url = `/uploads/${name}`;
  if (req.user?.role !== "producer" && !await one(`SELECT p.id FROM nexus_projects p
    LEFT JOIN nexus_seasons s ON s."projectId"=p.id
    LEFT JOIN nexus_episodes e ON e."seasonId"=s.id
    WHERE p.status='published' AND (p.cover=$1 OR p.banner=$1 OR s.cover=$1 OR e.cover=$1 OR e.video=$1)
    LIMIT 1`, [url])) fail("Arquivo não encontrado.", 404);
  const response = await fetch(storageUrl(`object/sign/nexus-media/${name}`), {
    method: "POST", headers: { ...storageHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  if (!response.ok) fail("Arquivo indisponível.", 502);
  const signed = await response.json();
  if (typeof signed.signedURL !== "string") fail("Arquivo indisponível.", 502);
  const signedUrl = new URL(signed.signedURL, process.env.SUPABASE_URL);
  if (signedUrl.origin !== new URL(process.env.SUPABASE_URL).origin)
    fail("Arquivo indisponível.", 502);
  if (!signedUrl.pathname.startsWith("/storage/v1/"))
    signedUrl.pathname = `/storage/v1${signedUrl.pathname}`;
  res.setHeader("Cache-Control", "private, max-age=60");
  res.redirect(302, signedUrl.toString());
}));
app.use("/api", (req, res) => res.status(404).json({ error: "Recurso não encontrado." }));
app.use(express.static(path.join(ROOT, "public")));
app.use((req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.code === "LIMIT_FILE_SIZE" ?
    "O arquivo excede o limite de 50 MB." : err.status ? err.message : "Não foi possível concluir a operação." });
});
export async function start() {
  await q("SELECT 1 FROM nexus_users LIMIT 1");
  const email = str(process.env.STUDIO_EMAIL).toLowerCase();
  const admin = await one("SELECT id FROM nexus_users WHERE email=$1", [email]);
  if (!admin) {
    const id = randomUUID();
    await q("INSERT INTO nexus_users(id,name,email,password,role) VALUES($1,$2,$3,$4,'producer')",
      [id, "Produtora", email, hash(process.env.STUDIO_PASSWORD)]);
    await q('INSERT INTO nexus_profiles(id,"userId",name,color) VALUES($1,$2,$3,$4)',
      [randomUUID(), id, "Produtora", "violet"]);
  }
  const port = Number(process.env.PORT || 10000);
  app.listen(port, "0.0.0.0", () => console.log(`P.A Nexus Studio publicado na porta ${port}`));
}
if (process.env.NODE_ENV !== "test")
  start().catch((e) => { console.error("Falha ao iniciar:", e); process.exit(1); });
