// One-time copy of local published productions and their referenced media.
// Deliberately excludes users, sessions, profiles, favorites and playback history.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, statSync } from "node:fs";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
for (const key of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"])
  if (!process.env[key]) throw new Error(`Defina ${key} antes da migração.`);
const db = new DatabaseSync(path.join(ROOT, "data", "nexus.sqlite"), { readOnly: true });
const projects = db.prepare("SELECT * FROM projects WHERE status='published' AND demo=0").all();
const bundle = projects.map((project) => {
  const seasons = db.prepare("SELECT * FROM seasons WHERE projectId=? ORDER BY number").all(project.id)
    .map((season) => ({ ...season,
      episodes: db.prepare("SELECT * FROM episodes WHERE seasonId=? ORDER BY number").all(season.id) }));
  return { project, seasons };
});
const references = bundle.flatMap(({ project, seasons }) => [project.cover, project.banner,
  ...seasons.flatMap((s) => [s.cover, ...s.episodes.flatMap((e) => [e.cover, e.video])])]);
const files = [...new Set(references.filter((s) => s?.startsWith("/uploads/")))];
for (const url of files) {
  const file = path.join(ROOT, "data", "uploads", path.basename(url));
  if (statSync(file).size > 50 * 1024 * 1024) throw new Error(`Arquivo acima de 50 MiB: ${url}`);
}
console.log(`Projetos para copiar: ${bundle.length}; mídias: ${files.length}.`);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2,
  ssl: { ca: readFileSync(path.join(ROOT, "database", "supabase-ca.crt"), "utf8"), rejectUnauthorized: true } });
try {
  for (const { project, seasons } of bundle) {
    if ((await pool.query("SELECT 1 FROM nexus_projects WHERE id=$1", [project.id])).rowCount) {
      console.log(`Já existe: ${project.title}`);
      continue;
    }
    const used = [...new Set([project.cover, project.banner,
      ...seasons.flatMap((s) => [s.cover, ...s.episodes.flatMap((e) => [e.cover, e.video])])]
      .filter((s) => s?.startsWith("/uploads/")))];
    for (const url of used) {
      const name = path.basename(url);
      const mime = name.endsWith(".mp4") ? "video/mp4" : name.endsWith(".webm") ? "video/webm"
        : name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
      const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/nexus-media/${name}`, {
        method: "POST", headers: { apikey: process.env.SUPABASE_SECRET_KEY,
          "Content-Type": mime, "x-upsert": "true" },
        body: readFileSync(path.join(ROOT, "data", "uploads", name))
      });
      if (!response.ok) throw new Error(`Falha no envio de ${name}: HTTP ${response.status} ${await response.text()}`);
      console.log(`Mídia enviada: ${name}`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO nexus_projects
        (id,title,description,genre,genres,rating,year,"releaseDate","scheduledDate",cover,banner,status,featured,demo,created)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [project.id, project.title, project.description, project.genre,
        project.genres || JSON.stringify([project.genre]), project.rating, project.year,
        project.releaseDate || null, project.scheduledDate || null, project.cover || "", project.banner || "",
        project.status, !!project.featured, false, project.created]);
      for (const season of seasons) {
        await client.query('INSERT INTO nexus_seasons(id,"projectId",number,title,cover) VALUES($1,$2,$3,$4,$5)',
          [season.id, project.id, season.number, season.title, season.cover || ""]);
        for (const episode of season.episodes)
          await client.query(`INSERT INTO nexus_episodes
            (id,"seasonId",number,title,description,cover,video,duration) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [episode.id, season.id, episode.number, episode.title, episode.description || "",
            episode.cover || "", episode.video || "", episode.duration || 0]);
      }
      await client.query("COMMIT");
      console.log(`Projeto copiado: ${project.title} (${seasons.reduce((n,s) => n+s.episodes.length,0)} episódios)`);
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
} finally { await pool.end(); db.close(); }
