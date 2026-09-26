import express from "express";
import multer from "multer";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOAD = path.join(DATA, "uploads");
fs.mkdirSync(UPLOAD, { recursive: true });
const db = new DatabaseSync(path.join(DATA, "nexus.sqlite"));
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,role TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,userId TEXT REFERENCES users(id),name TEXT,color TEXT);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,title TEXT,description TEXT,genre TEXT,genres TEXT,rating TEXT,year INTEGER,releaseDate TEXT,scheduledDate TEXT,cover TEXT,banner TEXT,status TEXT DEFAULT 'draft',featured INTEGER DEFAULT 0,demo INTEGER DEFAULT 0,created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS seasons(id TEXT PRIMARY KEY,projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,number INTEGER,title TEXT,cover TEXT,UNIQUE(projectId,number));
CREATE TABLE IF NOT EXISTS episodes(id TEXT PRIMARY KEY,seasonId TEXT REFERENCES seasons(id) ON DELETE CASCADE,number INTEGER,title TEXT,description TEXT DEFAULT '',cover TEXT,video TEXT,duration INTEGER DEFAULT 0,UNIQUE(seasonId,number));
CREATE TABLE IF NOT EXISTS favorites(profileId TEXT REFERENCES profiles(id) ON DELETE CASCADE,projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,PRIMARY KEY(profileId,projectId));
CREATE TABLE IF NOT EXISTS progress(profileId TEXT REFERENCES profiles(id) ON DELETE CASCADE,episodeId TEXT REFERENCES episodes(id) ON DELETE CASCADE,seconds REAL,duration REAL,updated TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(profileId,episodeId));`);
const projectColumns = new Set(db.prepare("PRAGMA table_info(projects)").all().map((x) => x.name));
for (const column of ["genres", "releaseDate", "scheduledDate"])
  if (!projectColumns.has(column)) db.exec(`ALTER TABLE projects ADD COLUMN ${column} TEXT`);
db.exec("UPDATE projects SET genres=json_array(genre) WHERE genres IS NULL");
const all = (q, ...args) => db.prepare(q).all(...args);
const get = (q, ...args) => db.prepare(q).get(...args);
const run = (q, ...args) => db.prepare(q).run(...args);
const hash = (password, salt = randomBytes(16).toString("hex")) =>
  `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const check = (password, stored) => {
  const [salt, h] = stored.split(":");
  return timingSafeEqual(Buffer.from(h, "hex"), scryptSync(password, salt, 64));
};
function addUser(name, email, password, role = "viewer") {
  const id = randomUUID();
  run(
    "INSERT INTO users VALUES(?,?,?,?,?)",
    id,
    name,
    email,
    hash(password),
    role,
  );
  if (role === "viewer") run("INSERT INTO profiles VALUES(?,?,?,?)", randomUUID(), id, name, "violet");
  return id;
}
if (!get("SELECT id FROM users LIMIT 1")) {
  db.exec("BEGIN");
  addUser("Produtora", "studio@panexus.local", "NexusStudio@2026", "producer");
  addUser("Explorador", "visitante@panexus.local", "NexusPlay@2026");
  const seed = [
    [
      "aurora",
      "Aurora: além do portal",
      "Quando uma misteriosa luz atravessa o céu, Lia e seu pequeno companheiro descobrem que o universo é muito maior do que imaginavam. Uma jornada sobre coragem, amizade e os mundos que existem dentro de nós.",
      "Aventura",
      "10",
      2026,
      "aurora.png",
    ],
    [
      "orbita",
      "Órbita 9",
      "Uma tripulação improvável. Uma nave com personalidade. E uma galáxia inteira para se perder. Embarque nesta aventura fora de órbita.",
      "Ficção científica",
      "L",
      2026,
      "orbita.png",
    ],
    [
      "bosque",
      "O segredo do bosque",
      "Uma raposinha e uma guardiã da floresta precisam encontrar a última semente de luz antes que a magia do bosque desapareça.",
      "Fantasia",
      "L",
      2026,
      "bosque.png",
    ],
    [
      "neon",
      "Neon Rush",
      "Nas pistas de uma cidade que nunca apaga, uma jovem piloto descobre que sua maior corrida começa fora do asfalto.",
      "Ação",
      "12",
      2026,
      "neon.png",
    ],
  ];
  for (const [id, title, description, genre, rating, year, asset] of seed) {
    run(
      "INSERT INTO projects(id,title,description,genre,rating,year,cover,banner,status,featured,demo) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      title,
      description,
      genre,
      rating,
      year,
      `/assets/${asset}`,
      `/assets/${asset}`,
      "published",
      id === "aurora" ? 1 : 0,
      1,
    );
    const sid = randomUUID();
    run(
      "INSERT INTO seasons VALUES(?,?,?,?,?)",
      sid,
      id,
      1,
      "O início de tudo",
      `/assets/${asset}`,
    );
    for (let n = 1; n <= 3; n++)
      run(
        "INSERT INTO episodes VALUES(?,?,?,?,?,?,?,?)",
        randomUUID(),
        sid,
        n,
        ["O chamado", "Um novo horizonte", "Além do possível"][n - 1],
        "Prévia visual demonstrativa da plataforma. Substitua este arquivo pelo episódio original no painel da produtora.",
        `/assets/${asset}`,
        "/assets/demo.mp4",
        12,
      );
  }
  db.exec("COMMIT");
}
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    req.headers.origin !== `http://${req.headers.host}`
  )
    return res.status(403).json({ error: "Origem não autorizada." });
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const token = req.headers.cookie
    ?.split("; ")
    .find((v) => v.startsWith("nexus="))
    ?.slice(6);
  req.user = token
    ? get(
        "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expires>?",
        token,
        Date.now(),
      )
    : null;
  req.token = token;
  next();
});
const auth = (req, res, next) =>
  req.user
    ? next()
    : res.status(401).json({ error: "Entre na sua conta para continuar." });
const producer = (req, res, next) =>
  req.user?.role === "producer"
    ? next()
    : res.status(403).json({ error: "Acesso exclusivo da produtora." });
const viewer = (req, res, next) =>
  !req.user ? auth(req, res, next) : req.user.role === "viewer"
    ? next()
    : res.status(403).json({ error: "Acesso exclusivo de telespectadores." });
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const str = (v, max = 200) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const number = (v, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    fail(`Informe um número entre ${min} e ${max}.`);
  return n;
};
const genresOf = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12)
    fail("Selecione de 1 a 12 gêneros.");
  const genres = [...new Set(value.map((v) => str(v, 40)))];
  if (genres.some((v) => !v)) fail("Gênero inválido.");
  return genres;
};
const dateOf = (value) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail("Informe uma data válida.");
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    fail("Informe uma data válida.");
  return value;
};
const todayInBrazil = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
function publishDueProjects() {
  const today = todayInBrazil();
  run(`UPDATE projects SET status='published',
    releaseDate=COALESCE(releaseDate, ?),
    year=CASE WHEN releaseDate IS NULL THEN CAST(substr(?,1,4) AS INTEGER) ELSE year END
    WHERE status='draft' AND scheduledDate IS NOT NULL AND scheduledDate<=?
    AND EXISTS(SELECT 1 FROM seasons s JOIN episodes e ON e.seasonId=s.id
      WHERE s.projectId=projects.id AND e.video IS NOT NULL AND e.video<>'')`, today, today, today);
}
setInterval(publishDueProjects, 60_000).unref();
const media = (v, kind = "image") => {
  if (!v) return "";
  if (typeof v !== "string" || !/^\/(assets|uploads)\/[a-zA-Z0-9_.-]+$/.test(v))
    fail("Arquivo inválido.");
  const filename = path.basename(v);
  const expected = kind === "video" ? /\.(mp4|webm)$/i : /\.(png|jpe?g|webp)$/i;
  const diskPath = v.startsWith("/uploads/")
    ? path.join(UPLOAD, filename)
    : path.join(ROOT, "public", "assets", filename);
  if (!expected.test(filename) || !fs.existsSync(diskPath))
    fail("Selecione um arquivo enviado e do tipo correto.");
  return v;
};
function profile(req) {
  const id = req.headers["x-profile-id"];
  if (
    !get(
      "SELECT id FROM profiles WHERE id=? AND userId=?",
      id || "",
      req.user.id,
    )
  )
    fail("Selecione um perfil válido.", 403);
  return id;
}
function project(id) {
  const p = get("SELECT * FROM projects WHERE id=?", id);
  if (!p) fail("Projeto não encontrado.", 404);
  return p;
}
function season(id) {
  const s = get("SELECT * FROM seasons WHERE id=?", id);
  if (!s) fail("Temporada não encontrada.", 404);
  return s;
}
function episode(id) {
  const e = get("SELECT * FROM episodes WHERE id=?", id);
  if (!e) fail("Episódio não encontrado.", 404);
  return e;
}
function unpublishEmpty(projectId) {
  if (
    !get(
      "SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.seasonId WHERE s.projectId=? AND e.video IS NOT NULL AND e.video<>'' LIMIT 1",
      projectId,
    )
  ) {
    run("UPDATE projects SET status='draft' WHERE id=?", projectId);
  }
}
function full(p) {
  return {
    ...p,
    genres: JSON.parse(p.genres || JSON.stringify([p.genre])),
    seasons: all(
      "SELECT * FROM seasons WHERE projectId=? ORDER BY number",
      p.id,
    ).map((s) => ({
      ...s,
      episodes: all(
        "SELECT * FROM episodes WHERE seasonId=? ORDER BY number",
        s.id,
      ),
    })),
  };
}
function session(req, res, user) {
  const token = randomBytes(32).toString("hex");
  run("DELETE FROM sessions WHERE expires<?", Date.now());
  run(
    "INSERT INTO sessions VALUES(?,?,?)",
    token,
    user.id,
    Date.now() + 7 * 86400000,
  );
  res.cookie("nexus", token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: 7 * 86400000,
  });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    profiles: all("SELECT * FROM profiles WHERE userId=?", user.id),
  });
}
const attempts = new Map();
app.post("/api/login", (req, res) => {
  const key = req.ip;
  const a = attempts.get(key) || { count: 0, until: Date.now() + 60000 };
  if (Date.now() > a.until) {
    a.count = 0;
    a.until = Date.now() + 60000;
  }
  a.count++;
  attempts.set(key, a);
  if (a.count > 20) fail("Muitas tentativas. Aguarde um minuto.", 429);
  const u = get(
    "SELECT * FROM users WHERE email=?",
    str(req.body.email).toLowerCase(),
  );
  if (!u || !check(str(req.body.password, 200), u.password))
    fail("E-mail ou senha incorretos.", 401);
  const area = req.body.area || "viewer";
  if (!["viewer", "studio"].includes(area)) fail("Área de acesso inválida.");
  if (u.role !== (area === "studio" ? "producer" : "viewer"))
    fail(area === "studio" ? "Esta conta não tem acesso à criação." : "Use a entrada da produtora para esta conta.", 403);
  attempts.delete(key);
  session(req, res, u);
});
app.post("/api/register", (req, res) => {
  const name = str(req.body.name, 40),
    email = str(req.body.email).toLowerCase(),
    password = str(req.body.password, 200);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    fail(
      "Preencha o nome, um e-mail válido e uma senha com ao menos 8 caracteres.",
    );
  if (get("SELECT id FROM users WHERE email=?", email))
    fail("Este e-mail já está cadastrado.", 409);
  const id = addUser(name, email, password);
  session(req, res, get("SELECT * FROM users WHERE id=?", id));
});
app.get("/api/session", (req, res) =>
  res.json({
    user: req.user || null,
    profiles: req.user
      ? all("SELECT * FROM profiles WHERE userId=?", req.user.id)
      : [],
  }),
);
app.post("/api/logout", auth, (req, res) => {
  run("DELETE FROM sessions WHERE token=?", req.token);
  res.clearCookie("nexus");
  res.json({ ok: true });
});
app.post("/api/profiles", viewer, (req, res) => {
  if (all("SELECT id FROM profiles WHERE userId=?", req.user.id).length >= 5)
    fail("Você pode criar até 5 perfis.");
  const name = str(req.body.name, 24);
  if (!name) fail("Dê um nome ao perfil.");
  const id = randomUUID();
  run(
    "INSERT INTO profiles VALUES(?,?,?,?)",
    id,
    req.user.id,
    name,
    ["violet", "coral", "mint", "blue"].includes(req.body.color)
      ? req.body.color
      : "violet",
  );
  res.json(get("SELECT * FROM profiles WHERE id=?", id));
});
app.get("/api/catalog", (req, res) => {
  publishDueProjects();
  res.json(
    all(
      "SELECT * FROM projects WHERE status='published' ORDER BY featured DESC,created DESC",
    ).map(full),
  );
});
app.get("/api/library", viewer, (req, res) => {
  const id = profile(req);
  res.json({
    favorites: all("SELECT projectId FROM favorites WHERE profileId=?", id).map(
      (x) => x.projectId,
    ),
    progress: all(
      "SELECT * FROM progress WHERE profileId=? ORDER BY updated DESC",
      id,
    ),
  });
});
app.put("/api/favorites/:id", viewer, (req, res) => {
  const id = profile(req);
  if (project(req.params.id).status !== "published")
    fail("Desenho indisponível.", 404);
  if (req.body.saved)
    run("INSERT OR IGNORE INTO favorites VALUES(?,?)", id, req.params.id);
  else
    run(
      "DELETE FROM favorites WHERE profileId=? AND projectId=?",
      id,
      req.params.id,
    );
  res.json({ ok: true });
});
app.put("/api/progress/:id", viewer, (req, res) => {
  const id = profile(req);
  const e = episode(req.params.id);
  if (project(season(e.seasonId).projectId).status !== "published")
    fail("Episódio indisponível.", 404);
  const seconds = Number(req.body.seconds),
    duration = Number(req.body.duration);
  if (
    !Number.isFinite(seconds) ||
    !Number.isFinite(duration) ||
    seconds < 0 ||
    duration <= 0
  )
    fail("Progresso inválido.");
  run(
    "INSERT INTO progress VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(profileId,episodeId) DO UPDATE SET seconds=excluded.seconds,duration=excluded.duration,updated=CURRENT_TIMESTAMP",
    id,
    e.id,
    Math.min(seconds, duration),
    duration,
  );
  res.json({ ok: true });
});
app.get("/api/studio/members", producer, (req, res) => {
  res.json(all("SELECT id,name,email,role FROM users ORDER BY name,email"));
});
app.post("/api/studio/members", producer, (req, res) => {
  const name = str(req.body.name, 40), email = str(req.body.email).toLowerCase();
  const password = str(req.body.password, 200), role = req.body.role;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    fail("Preencha o nome, um e-mail válido e uma senha com ao menos 8 caracteres.");
  if (!["viewer", "producer"].includes(role)) fail("Nível de acesso inválido.");
  if (get("SELECT id FROM users WHERE email=?", email)) fail("Este e-mail já está cadastrado.", 409);
  let id;
  db.exec("BEGIN");
  try {
    id = addUser(name, email, password, role);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.status(201).json({ id, name, email, role });
});
app.put("/api/studio/members/:id", producer, (req, res) => {
  const role = req.body.role;
  if (!["viewer", "producer"].includes(role)) fail("Nível de acesso inválido.");
  if (req.params.id === req.user.id) fail("Você não pode alterar o próprio acesso.", 403);
  const member = get("SELECT id,name,email,role FROM users WHERE id=?", req.params.id);
  if (!member) fail("Membro não encontrado.", 404);
  if (member.role !== role) {
    db.exec("BEGIN");
    try {
      run("UPDATE users SET role=? WHERE id=?", role, member.id);
      if (role === "viewer" && !get("SELECT id FROM profiles WHERE userId=? LIMIT 1", member.id))
        run("INSERT INTO profiles VALUES(?,?,?,?)", randomUUID(), member.id, member.name, "violet");
      run("DELETE FROM sessions WHERE userId=?", member.id);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    member.role = role;
  }
  res.json(member);
});
app.get("/api/studio/projects", producer, (req, res) => {
  publishDueProjects();
  res.json(all("SELECT * FROM projects ORDER BY created DESC").map(full));
});
app.post("/api/studio/projects", producer, (req, res) => {
  const title = str(req.body.title);
  if (!title) fail("Informe o nome do desenho.");
  const genres = genresOf(req.body.genres ?? [req.body.genre || "Aventura"]);
  const releaseDate = dateOf(req.body.releaseDate);
  const scheduledDate = dateOf(req.body.scheduledDate);
  const count = number(req.body.seasons || 1, 1, 20),
    eps = number(req.body.episodes || 1, 1, 100),
    id = randomUUID();
  db.exec("BEGIN");
  try {
    run(
      "INSERT INTO projects(id,title,description,genre,genres,rating,year,releaseDate,scheduledDate,cover,banner) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      title,
      str(req.body.description, 3000),
      genres[0],
      JSON.stringify(genres),
      str(req.body.rating) || "L",
      releaseDate ? Number(releaseDate.slice(0, 4)) : new Date().getFullYear(),
      releaseDate,
      scheduledDate,
      media(req.body.cover),
      media(req.body.banner),
    );
    for (let n = 1; n <= count; n++) {
      const sid = randomUUID();
      run(
        "INSERT INTO seasons VALUES(?,?,?,?,?)",
        sid,
        id,
        n,
        `Temporada ${n}`,
        "",
      );
      for (let j = 1; j <= eps; j++)
        run(
          "INSERT INTO episodes(id,seasonId,number,title) VALUES(?,?,?,?)",
          randomUUID(),
          sid,
          j,
          `Episódio ${j}`,
        );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.status(201).json(full(project(id)));
});
app.put("/api/studio/projects/:id", producer, (req, res) => {
  const p = project(req.params.id),
    b = { ...p, ...req.body };
  if (!str(b.title)) fail("Informe o nome do desenho.");
  const genres = genresOf(req.body.genres ?? (req.body.genre ? [req.body.genre] : JSON.parse(p.genres)));
  const releaseDate = dateOf(b.releaseDate);
  const scheduledDate = dateOf(req.body.status === "draft" && p.status === "published" && !Object.hasOwn(req.body, "scheduledDate") ? null : b.scheduledDate);
  if (!["draft", "published"].includes(b.status)) fail("Status inválido.");
  if (
    b.status === "published" &&
    !get(
      "SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.seasonId WHERE s.projectId=? AND e.video IS NOT NULL AND e.video<>? LIMIT 1",
      p.id,
      "",
    )
  )
    fail("Envie o vídeo de pelo menos um episódio antes de publicar.");
  run(
    "UPDATE projects SET title=?,description=?,genre=?,genres=?,rating=?,year=?,releaseDate=?,scheduledDate=?,cover=?,banner=?,status=?,featured=? WHERE id=?",
    str(b.title),
    str(b.description, 3000),
    genres[0],
    JSON.stringify(genres),
    str(b.rating),
    releaseDate ? Number(releaseDate.slice(0, 4)) : number(p.year, 1900, 2100),
    releaseDate,
    scheduledDate,
    media(b.cover),
    media(b.banner),
    b.status,
    b.featured ? 1 : 0,
    p.id,
  );
  if (b.featured) run("UPDATE projects SET featured=0 WHERE id<>?", p.id);
  res.json(full(project(p.id)));
});
app.delete("/api/studio/projects/:id", producer, (req, res) => {
  project(req.params.id);
  run("DELETE FROM projects WHERE id=?", req.params.id);
  res.json({ ok: true });
});
app.post("/api/studio/projects/:id/seasons", producer, (req, res) => {
  project(req.params.id);
  const n = get(
    "SELECT COALESCE(MAX(number),0)+1 n FROM seasons WHERE projectId=?",
    req.params.id,
  ).n;
  const id = randomUUID();
  run(
    "INSERT INTO seasons VALUES(?,?,?,?,?)",
    id,
    req.params.id,
    n,
    `Temporada ${n}`,
    "",
  );
  res.status(201).json({ id });
});
app.put("/api/studio/seasons/:id", producer, (req, res) => {
  const s = season(req.params.id);
  run(
    "UPDATE seasons SET title=?,cover=? WHERE id=?",
    str(req.body.title) || s.title,
    Object.hasOwn(req.body, "cover") ? media(req.body.cover) : s.cover,
    s.id,
  );
  res.json({ ok: true });
});
app.delete("/api/studio/seasons/:id", producer, (req, res) => {
  const s = season(req.params.id);
  run("DELETE FROM seasons WHERE id=?", req.params.id);
  unpublishEmpty(s.projectId);
  res.json({ ok: true });
});
app.post("/api/studio/seasons/:id/episodes", producer, (req, res) => {
  season(req.params.id);
  const n = get(
      "SELECT COALESCE(MAX(number),0)+1 n FROM episodes WHERE seasonId=?",
      req.params.id,
    ).n,
    id = randomUUID();
  run(
    "INSERT INTO episodes(id,seasonId,number,title) VALUES(?,?,?,?)",
    id,
    req.params.id,
    n,
    `Episódio ${n}`,
  );
  res.status(201).json({ id });
});
app.put("/api/studio/episodes/:id", producer, (req, res) => {
  const e = episode(req.params.id),
    b = { ...e, ...req.body };
  if (!str(b.title)) fail("Informe o título do episódio.");
  run(
    "UPDATE episodes SET title=?,description=?,cover=?,video=?,duration=? WHERE id=?",
    str(b.title),
    str(b.description, 2000),
    media(b.cover),
    media(b.video, "video"),
    number(b.duration || 0, 0, 86400),
    e.id,
  );
  unpublishEmpty(season(e.seasonId).projectId);
  res.json({ ok: true });
});
app.delete("/api/studio/episodes/:id", producer, (req, res) => {
  const e = episode(req.params.id);
  run("DELETE FROM episodes WHERE id=?", req.params.id);
  unpublishEmpty(season(e.seasonId).projectId);
  res.json({ ok: true });
});
const upload = multer({
  dest: UPLOAD,
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 },
});
app.post("/api/studio/upload", producer, upload.single("file"), (req, res) => {
  const f = req.file;
  if (!f) fail("Escolha um arquivo.");
  try {
    const fd = fs.openSync(f.path, "r"),
      head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    let ext;
    if (
      head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      ext = ".png";
    else if (head[0] === 255 && head[1] === 216 && head[2] === 255)
      ext = ".jpg";
    else if (
      head.toString("ascii", 0, 4) === "RIFF" &&
      head.toString("ascii", 8, 12) === "WEBP"
    )
      ext = ".webp";
    else if (head.toString("ascii", 4, 8) === "ftyp") ext = ".mp4";
    else if (head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
      ext = ".webm";
    else fail("Formato não suportado. Use JPG, PNG, WebP, MP4 ou WebM.");
    const isVideo = [".mp4", ".webm"].includes(ext);
    if (
      (req.query.kind === "video" && !isVideo) ||
      (req.query.kind !== "video" && isVideo)
    )
      fail("Selecione o tipo correto de arquivo para este campo.");
    if (!isVideo && f.size > 10 * 1024 * 1024)
      fail("A imagem deve ter até 10 MB.");
    const filename = randomUUID() + ext;
    fs.renameSync(f.path, path.join(UPLOAD, filename));
    res.status(201).json({ url: `/uploads/${filename}` });
  } catch (e) {
    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    throw e;
  }
});
app.use(
  "/uploads",
  (req, res, next) => {
    const url = "/uploads/" + path.basename(req.path);
    if (req.user?.role === "producer") return next();
    const visible = get(
      `SELECT p.id FROM projects p LEFT JOIN seasons s ON s.projectId=p.id LEFT JOIN episodes e ON e.seasonId=s.id WHERE p.status='published' AND (p.cover=? OR p.banner=? OR s.cover=? OR e.cover=? OR e.video=?) LIMIT 1`,
      url,
      url,
      url,
      url,
      url,
    );
    return visible ? next() : res.status(404).end();
  },
  express.static(UPLOAD),
);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Recurso não encontrado." }),
);
app.use(express.static(path.join(ROOT, "public")));
app.use((req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 400).json({
    error:
      err.code === "LIMIT_FILE_SIZE"
        ? "O arquivo excede o limite de 2 GB."
        : err.message || "Não foi possível concluir a operação.",
  });
});
const port = Number(process.env.PORT || 3210);
app.listen(port, "127.0.0.1", () =>
  console.log(`P.A Nexus Studio em http://127.0.0.1:${port}`),
);
