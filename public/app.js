import { EditorDrafts } from "./editor-drafts.js";
const editorDrafts = new EditorDrafts();
const hosted = location.protocol === "https:";
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  play: '<path d="m8 5 12 7-12 7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  film: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m3 5 3-3h15v3M8 9v7m8-7v7M4 9h16M4 16h16"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  logout: '<path d="M9 3H4v18h5m-1-9h13m-5-5 5 5-5 5"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 8 15 8 15S25 10 20 5Z"/>',
  edit: '<path d="m4 16-1 5 5-1L21 7l-6-4ZM13 5l6 6"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
const ico = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${n === "play" ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[n] || icons.film}</svg>`;
let state = {
  user: null,
  profiles: [],
  profile: null,
  catalog: [],
  studio: [],
  members: [],
  studioView: "projects",
  favorites: [],
  progress: [],
  filter: "Todos",
  search: "",
  tab: "home",
  editing: null,
  season: null,
  heroId: null,
};
let dialogReturn = null,
  playerState = null;
async function api(url, method = "GET", body) {
  const r = await fetch("/api" + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(state.profile ? { "X-Profile-Id": state.profile.id } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    keepalive: url.startsWith("/progress/"),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Não foi possível concluir.");
  return d;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4000);
}
function openModal(html, cls = "") {
  const d = $("#modal");
  dialogReturn = document.activeElement;
  d.className = cls;
  d.innerHTML = `<button class="icon close" data-action="close" aria-label="Fechar">${ico("close")}</button>${html}`;
  if (!d.open) d.showModal();
}
function closeModal() {
  if (playerState) {
    saveProgress();
    playerState = null;
  }
  const d = $("#modal");
  d.close();
  d.innerHTML = "";
  dialogReturn?.focus?.();
}
$("#modal").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
const brand = () =>
  `<a href="#home" class="brand" aria-label="P.A Nexus Studio — início"><img src="/assets/brand.jpeg" alt="P.A Nexus Studio"></a>`;
const avatar = (p) =>
  `<span class="avatar ${esc(p?.color || "violet")}">${esc((p?.name || "N").slice(0, 1))}<i></i></span>`;
function header() {
  const creator = state.user?.role === "producer";
  return `<header>${brand()}<nav aria-label="Menu principal"><a class="${state.tab === "home" ? "active" : ""}" href="#home">Início</a><a class="${state.tab === "catalog" ? "active" : ""}" href="#catalog">Explorar</a>${creator ? "" : `<a class="${state.tab === "list" ? "active" : ""}" href="#list">Minha lista</a>`}</nav><div class="header-right"><button class="icon" data-action="search" aria-label="Buscar desenhos">${ico("search")}</button><span class="divider"></span><a class="studio-link" href="#studio">${ico("film")} Área da produtora</a>${state.user ? creator ? `<button class="profile-button" data-action="logout" aria-label="Sair da conta">${avatar({name:state.user.name})}<span>${esc(state.user.name)}</span>${ico("logout")}</button>` : `<button class="profile-button" data-action="profiles" aria-label="Trocar perfil">${avatar(state.profile)}<span>${esc(state.profile?.name || state.user.name)}</span><span class="down">⌄</span></button>` : '<button class="btn small" data-action="login">Entrar</button>'}</div></header>`;
}
const footer = () =>
  `<footer><div><strong>P.A <b>NEXUS</b> STUDIO<span>✦</span></strong><p>Histórias que conectam universos.</p></div><span>Feito de imaginação. Feito para você.<br><small>© 2026 P.A Nexus Studio${hosted ? "" : " · Versão local"}</small></span><a href="#studio">Portal da produtora ${ico("arrow")}</a></footer>`;
const image = (p) => p.cover || "/assets/brand.jpeg";
const genreOptions = ["Ação", "Aventura", "Comédia", "Drama", "Fantasia", "Ficção científica", "Infantil", "Mistério", "Musical", "Romance", "Suspense", "Terror"];
const genres = (p) => p.genres?.length ? p.genres : [p.genre];
const genreText = (p) => genres(p).join(" · ");
const hasGenre = (p, genre) => genre === "Todos" || genres(p).includes(genre);
const genreChoices = (selected = ["Aventura"]) => {
  const options = [...new Set([...genreOptions, ...selected])];
  return `<fieldset class="genre-field"><legend>Gêneros <small>(selecione um ou mais)</small></legend><div class="genre-grid">${options.map((g) => `<label class="genre-choice"><input type="checkbox" name="genres" value="${esc(g)}" ${selected.includes(g) ? "checked" : ""}><span>${esc(g)}</span></label>`).join("")}</div></fieldset>`;
};
const dateLabel = (date, fallback) => date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("pt-BR", {timeZone:"UTC"}) : fallback;
const episodes = (p) => p.seasons.flatMap((s) => s.episodes);
const rating = (p) =>
  `<span class="rating ${p.rating === "L" ? "free" : ""}">${esc(p.rating)}</span>`;
function card(p, wide = false) {
  return `<article class="card ${wide ? "wide" : ""}"><button class="card-art" data-action="details" data-id="${p.id}" aria-label="Ver ${esc(p.title)}"><img src="${esc(image(p))}" alt="${esc(p.title)}" loading="lazy"><span class="card-logo">N<span>✦</span></span>${p.demo ? '<span class="demo-label">UNIVERSO DEMO</span>' : ""}<span class="card-title ${p.id}">${esc(p.title.includes(":") ? p.title.split(":")[0] : p.title)}${p.title.includes(":") ? `<small>${esc(p.title.split(":")[1])}</small>` : ""}</span><span class="card-hover">${ico("play")}</span></button><div class="card-meta"><div><h3>${esc(p.title)}</h3><span>${esc(genreText(p))} <i>•</i> ${p.seasons.length} temporada${p.seasons.length !== 1 ? "s" : ""}</span></div>${state.user?.role === "producer" ? "" : `<button class="icon save ${state.favorites.includes(p.id) ? "saved" : ""}" data-action="favorite" data-id="${p.id}" aria-label="${state.favorites.includes(p.id) ? "Remover" : "Adicionar"} ${esc(p.title)} ${state.favorites.includes(p.id) ? "da" : "à"} minha lista">${ico(state.favorites.includes(p.id) ? "check" : "plus")}</button>`}</div></article>`;
}
function continueRow() {
  const items = state.progress
    .map((r) => {
      const p = state.catalog.find((p) =>
        episodes(p).some((e) => e.id === r.episodeId),
      );
      return { p, r, e: p && episodes(p).find((e) => e.id === r.episodeId) };
    })
    .filter((x) => x.p && x.r.seconds > 0 && x.r.seconds < x.r.duration * 0.95);
  return items.length
    ? `<section class="shelf"><div class="section-head"><h2>Continue sua jornada</h2><span>De onde você parou</span></div><div class="continue-grid">${items
        .slice(0, 4)
        .map(
          ({ p, r, e }) =>
            `<button class="continue-card" data-action="play" data-id="${p.id}" data-episode="${e.id}"><img src="${esc(e.cover || image(p))}" alt=""><span class="play-circle">${ico("play")}</span><div><h3>${esc(p.title)}</h3><p>E${e.number} · ${esc(e.title)}</p><div class="progress-line"><i style="width:${Math.min(100, (r.seconds / r.duration) * 100)}%"></i></div></div></button>`,
        )
        .join("")}</div></section>`
    : "";
}
function home() {
  const hero =
    state.catalog.find((p) => p.id === state.heroId) ||
    state.catalog.find((p) => p.featured) ||
    state.catalog[0];
  return `${
    hero
      ? `<section class="hero" style="--hero:url('${esc(hero.banner || image(hero))}')"><div class="hero-content"><div class="eyebrow"><span class="mini-n">N✦</span> UMA PRODUÇÃO P.A NEXUS <span class="outlined">EM DESTAQUE</span></div><h1 class="${hero.title.split(":")[0].length > 14 ? "long-title" : ""}">${esc(hero.title.split(":")[0])}${hero.title.includes(":") ? `<span>${esc(hero.title.split(":")[1])}</span>` : ""}</h1><div class="hero-meta"><span class="match">Um novo universo espera por você</span><span>${dateLabel(hero.releaseDate, hero.year)}</span>${rating(hero)}<span>${hero.seasons.length} temporada${hero.seasons.length !== 1 ? "s" : ""}</span></div><p>${esc(hero.description)}</p><div class="hero-actions"><button class="btn" data-action="play" data-id="${hero.id}">${ico("play")} Assistir agora</button><button class="btn glass" data-action="details" data-id="${hero.id}">${ico("info")} Conhecer a série</button><button class="icon circle" data-action="favorite" data-id="${hero.id}" aria-label="Salvar destaque na minha lista">${ico(state.favorites.includes(hero.id) ? "check" : "plus")}</button></div><div class="hero-note"><span></span> Sua próxima aventura começa aqui</div></div><div class="hero-bottom"><span>IMAGINAÇÃO SEM LIMITES.</span><div class="hero-dots" aria-label="Selecionar destaque">${state.catalog
          .slice(0, 6)
          .map(
            (p) =>
              `<button class="${p.id === hero.id ? "selected" : ""}" data-action="hero" data-id="${p.id}" aria-label="Destacar ${esc(p.title)}" aria-pressed="${p.id === hero.id}"></button>`,
          )
          .join(
            "",
          )}</div><span>${String(state.catalog.findIndex((p) => p.id === hero.id) + 1).padStart(2, "0")} <b>/ ${String(state.catalog.length).padStart(2, "0")}</b></span></div></section>`
      : ""
  }<main id="main" class="home-main"><section class="welcome-strip"><div><span class="spark">✦</span><p>Pequenas telas. <strong>Infinitos universos.</strong></p></div><span>Animações independentes. Histórias extraordinárias.</span></section>${continueRow()}<section class="shelf"><div class="section-head"><div><span class="eyebrow purple">DÊ O PLAY NA IMAGINAÇÃO</span><h2>Encontre seu próximo universo<span class="purple">.</span></h2></div><a href="#catalog">Explorar catálogo ${ico("arrow")}</a></div><div class="chips" aria-label="Filtrar por gênero">${["Todos", ...genreOptions].map((g) => `<button class="chip ${state.filter === g ? "selected" : ""}" data-action="filter" data-value="${g}">${g === "Todos" ? "✦ " : ""}${g}</button>`).join("")}</div><div class="card-grid">${
    state.catalog
      .filter((p) => state.filter === "Todos" || hasGenre(p, state.filter))
      .map((p) => card(p))
      .join("") ||
    empty(
      "Novos mundos estão a caminho.",
      "Nenhum desenho neste gênero por enquanto.",
    )
  }</div></section><section class="studio-banner"><div class="orbit-mark">N<span>✦</span></div><div><span class="eyebrow purple">DO PRIMEIRO TRAÇO AO ÚLTIMO FRAME</span><h2>Todo grande universo<br>começa com uma ideia.</h2><p>Somos a P.A Nexus Studio. Transformamos imaginação<br>em histórias que merecem ser vividas.</p></div><a class="btn glass" href="#studio">Conheça o espaço de criação ${ico("arrow")}</a><span class="banner-star">✦</span></section></main>`;
}
function empty(title, sub) {
  return `<div class="empty">${ico("film")}<h3>${title}</h3><p>${sub}</p></div>`;
}
function catalog() {
  let list =
    state.tab === "list"
      ? state.catalog.filter((p) => state.favorites.includes(p.id))
      : state.catalog;
  list = list.filter(
    (p) =>
      (state.filter === "Todos" || hasGenre(p, state.filter)) &&
      `${p.title} ${genreText(p)} ${p.description}`
        .toLocaleLowerCase()
        .includes(state.search.toLocaleLowerCase()),
  );
  return `<main id="main" class="catalog-page"><span class="eyebrow purple">SEU PASSAPORTE PARA OUTROS MUNDOS</span><h1>${state.tab === "list" ? "Minha lista" : "Explore o inesperado"}<span class="purple">.</span></h1><p>${state.tab === "list" ? "Suas próximas aventuras, guardadas em um só lugar." : "Encontre uma história para cada versão de você."}</p><div class="catalog-controls"><label class="search-box">${ico("search")}<input id="search" placeholder="Buscar títulos, histórias, gêneros..." value="${esc(state.search)}" aria-label="Buscar no catálogo"></label><select id="genre-filter" aria-label="Gênero">${["Todos", ...new Set(state.catalog.flatMap(genres))].map((g) => `<option ${g === state.filter ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></div><div id="catalog-results" class="card-grid">${list.map((p) => card(p)).join("") || empty(state.tab === "list" ? "Sua próxima história ainda está por aqui." : "Nenhum universo encontrado.", "Explore o catálogo ou tente uma nova busca.")}</div></main>`;
}
function render() {
  const route = location.hash.slice(1) || "home";
  state.tab = ["catalog", "list", "studio"].includes(route) ? route : "home";
  if (state.tab === "list" && state.user?.role === "producer") { location.hash = "studio"; return; }
  if (state.tab === "studio") {
    renderStudio();
    return;
  }
  $("#app").innerHTML =
    header() + (state.tab === "home" ? home() : catalog()) + footer();
  if (state.tab === "list" && !state.user) authModal();
}
async function loadLibrary() {
  if (state.user?.role !== "viewer" || !state.profile) {
    state.favorites = [];
    state.progress = [];
    return;
  }
  const d = await api("/library");
  Object.assign(state, d);
}
function authModal(producer = false, register = false) {
  openModal(
    `<div class="auth-brand">${brand()}</div><span class="eyebrow purple">${producer ? "ESPAÇO DE CRIAÇÃO" : "SEU PRÓXIMO UNIVERSO"}</span><h2>${register ? "Comece sua história." : producer ? "Olá, criador." : "Bom te ver por aqui."}</h2><p>${register ? "Crie uma conta para guardar suas histórias favoritas." : producer ? "Entre para dar vida às suas próximas produções." : "Entre e continue sua próxima aventura."}</p><form id="auth-form" data-register="${register}" data-producer="${producer}">${register ? '<label>Seu nome<input name="name" required maxlength="40" autocomplete="name"></label>' : ""}<label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="voce@exemplo.com"></label><label>Senha<input name="password" type="password" required minlength="8" autocomplete="${register ? "new-password" : "current-password"}" placeholder="Pelo menos 8 caracteres"></label><p class="form-error" role="alert"></p><button class="btn full" type="submit">${register ? "Criar minha conta" : "Entrar"} ${ico("arrow")}</button></form>${!producer ? `<p class="auth-switch">${register ? "Já faz parte desse universo?" : "Ainda não tem uma conta?"} <button class="text-button" data-action="${register ? "login" : "register"}">${register ? "Entrar" : "Criar conta"}</button></p>` : ""}${hosted ? "" : `<div class="demo-access"><span>EXPERIMENTE A VERSÃO LOCAL</span><button class="btn glass full" data-action="demo-login" data-role="${producer ? "producer" : "viewer"}">${ico(producer ? "film" : "play")} ${producer ? "Acessar produtora de demonstração" : "Entrar como visitante de demonstração"}</button></div>`}`,
    "auth-modal",
  );
}
function profilesModal() {
  openModal(
    `<div class="center"><span class="eyebrow purple">CADA PESSOA, UM UNIVERSO</span><h2>Quem vai embarcar?</h2><p>Escolha seu perfil para continuar.</p><div class="profiles">${state.profiles.map((p) => `<button data-action="select-profile" data-id="${p.id}">${avatar(p)}<strong>${esc(p.name)}</strong></button>`).join("")}${state.profiles.length < 5 ? `<button data-action="new-profile"><span class="avatar add">${ico("plus")}</span><strong>Novo perfil</strong></button>` : ""}</div><button class="text-button muted" data-action="logout">${ico("logout")} Sair da conta</button></div>`,
    "profiles-modal",
  );
}
function details(id, seasonId) {
  const p = state.catalog.find((x) => x.id === id);
  if (!p) return;
  const s = p.seasons.find((s) => s.id === seasonId) || p.seasons[0];
  openModal(
    `<div class="detail-hero" style="background-image:linear-gradient(0deg,#17131d,transparent),url('${esc(p.banner || image(p))}')"><span class="eyebrow">P.A NEXUS ORIGINAL</span><h2>${esc(p.title)}</h2></div><div class="detail-body"><div class="hero-meta">${rating(p)}<span>${dateLabel(p.releaseDate, p.year)}</span><span>${esc(genreText(p))}</span>${p.demo ? '<span class="demo-pill">Produção demonstrativa</span>' : ""}</div><p>${esc(p.description)}</p><div class="hero-actions"><button class="btn" data-action="play" data-id="${p.id}">${ico("play")} Assistir</button><button class="btn glass" data-action="favorite" data-id="${p.id}">${ico(state.favorites.includes(id) ? "check" : "plus")} Minha lista</button></div><div class="section-head"><h3>Episódios</h3><select id="season-select" data-id="${p.id}" aria-label="Selecionar temporada">${p.seasons.map((x) => `<option value="${x.id}" ${s?.id === x.id ? "selected" : ""}>Temporada ${x.number} · ${esc(x.title)}</option>`).join("")}</select></div>${s?.cover ? `<div class="season-banner"><img src="${esc(s.cover)}" alt="Capa da temporada ${s.number}"><span>Temporada ${s.number}<strong>${esc(s.title)}</strong></span></div>` : ""}<div class="episode-list">${s?.episodes.map((e) => `<button class="episode" data-action="play" data-id="${p.id}" data-episode="${e.id}" ${!e.video ? "disabled" : ""}><span class="episode-number">${String(e.number).padStart(2, "0")}</span><div class="episode-thumb"><img src="${esc(e.cover || s.cover || image(p))}" alt="">${ico("play")}</div><div><h4>${esc(e.title)}</h4><p>${esc(e.description || "Uma nova parte desta história espera por você.")}</p><small>${e.video ? (p.demo ? "Prévia demo · 12 segundos" : e.duration ? Math.ceil(e.duration / 60) + " min" : "Pronto para assistir") : "Em breve"}</small></div></button>`).join("") || empty("Novos episódios em breve.", "Volte para continuar esta jornada.")}</div></div>`,
    "details-modal",
  );
}
function play(id, eid) {
  const p = state.catalog.find((x) => x.id === id);
  if (!state.user) {
    authModal();
    return;
  }
  if (state.user.role !== "viewer") { toast("Para assistir, entre com uma conta de telespectador."); return; }
  const e = eid
    ? episodes(p).find((e) => e.id === eid)
    : episodes(p).find((e) => e.video);
  if (!e?.video) {
    toast("Este episódio estará disponível em breve.");
    return;
  }
  if (playerState) saveProgress();
  const progress = state.progress.find((x) => x.episodeId === e.id);
  openModal(
    `<div class="player-heading"><span class="eyebrow purple">${esc(p.title)}</span><h2>${esc(e.title)}</h2><p>Episódio ${e.number}${p.demo ? " · Prévia visual de demonstração" : ""}</p></div><video id="video" controls autoplay playsinline preload="metadata" poster="${esc(e.cover || image(p))}" src="${esc(e.video)}"></video><div class="player-footer"><span id="player-status">${p.demo ? "Este clipe é uma prévia visual. Envie seus episódios completos na área da produtora." : "Seu progresso é salvo automaticamente neste perfil."}</span><button class="btn glass small" data-action="next-episode" data-id="${p.id}" data-episode="${e.id}">Próximo episódio ${ico("arrow")}</button></div>`,
    "player-modal",
  );
  playerState = { p, e, last: 0 };
  const v = $("#video");
  v.addEventListener("loadedmetadata", () => {
    if (progress && progress.seconds < progress.duration * 0.95)
      v.currentTime = progress.seconds;
  });
  v.addEventListener("timeupdate", () => {
    if (playerState && Date.now() - playerState.last > 3000) {
      saveProgress();
      playerState.last = Date.now();
    }
  });
  v.addEventListener("pause", saveProgress);
  v.addEventListener("ended", () => {
    saveProgress();
    $("#player-status").textContent =
      "Episódio concluído. Sua próxima aventura está a um play.";
  });
  v.addEventListener("error", () => {
    $("#player-status").textContent =
      "Não foi possível reproduzir este vídeo. Confira o arquivo na produtora; recomendamos MP4 com H.264 e AAC.";
  });
}
function saveProgress() {
  const v = $("#video");
  if (!v || !playerState || !Number.isFinite(v.duration) || !v.duration) return;
  const e = playerState.e;
  const record = {
    episodeId: e.id,
    seconds: v.currentTime,
    duration: v.duration,
  };
  state.progress = state.progress.filter((x) => x.episodeId !== e.id);
  state.progress.unshift(record);
  api("/progress/" + e.id, "PUT", record).catch(() =>
    toast("Não foi possível salvar seu progresso."),
  );
}
async function refreshStudio() {
  state.studio = await api("/studio/projects");
  state.catalog = await api("/catalog");
}
async function refreshMembers() { state.members = await api("/studio/members"); }
function renderStudio() {
  if (!state.user || state.user.role !== "producer") {
    $("#app").innerHTML =
      header() +
      `<main id="main" class="studio-gate"><span class="spark">✦</span><span class="eyebrow purple">POR TRÁS DE CADA UNIVERSO</span><h1>A próxima grande história<br>começa com você.</h1><p>Organize produções, construa temporadas e compartilhe sua imaginação.</p><button class="btn" data-action="studio-login">${ico("film")} Entrar na produtora</button><a href="#home">Voltar para o catálogo</a></main>` +
      footer();
    return;
  }
  const p = state.studioView === "members" ? null : state.studio.find((x) => x.id === state.editing);
  $("#app").innerHTML =
    `<div class="studio-layout"><aside>${brand()}<span class="workspace-label">WORKSPACE DA PRODUTORA</span><nav><button class="${state.studioView === "projects" ? "active" : ""}" data-action="studio-home">${ico("grid")} Visão geral</button><button data-action="new-project">${ico("plus")} Novo projeto</button><button class="${state.studioView === "members" ? "active" : ""}" data-action="studio-members">${ico("heart")} Membros</button><a href="#home">${ico("eye")} Ver plataforma</a></nav><div class="aside-bottom"><div><span class="live-dot"></span> ${hosted ? "Estúdio online" : "Estúdio local"}</div><p>Um espaço para criar<br>universos inteiros.</p><button class="text-button" data-action="logout">${ico("logout")} Sair</button></div></aside><div class="studio-content"><div class="studio-top"><span>Estúdio <i>/</i> ${state.studioView === "members" ? "Membros" : p ? esc(p.title) : "Visão geral"}</span><div>${avatar({name:state.user.name})}<span>${esc(state.user.name)}</span></div></div><main id="main">${state.studioView === "members" ? membersPage() : p ? editor(p) : dashboard()}</main></div></div>`;
  for (const form of $("#app").querySelectorAll(
    "#project-edit, #season-edit",
  )) {
    const status = document.createElement("p");
    status.className = "draft-status hint";
    status.setAttribute("role", "status");
    form.querySelector(".form-error").before(status);
  }
  editorDrafts.restore($("#app"));
}
function dashboard() {
  const projects = state.studio,
    eps = projects.flatMap(episodes);
  return `<div class="dashboard-heading"><div><span class="eyebrow purple">A IMAGINAÇÃO ESTÁ EM PRODUÇÃO</span><h1>Seu estúdio. Seus universos<span class="purple">.</span></h1><p>Do primeiro rascunho ao próximo episódio favorito.</p></div><button class="btn" data-action="new-project">${ico("plus")} Novo projeto</button></div><div class="stats">${[
    [projects.length, "Projetos no estúdio", "film"],
    [
      projects.filter((p) => p.status === "published").length,
      "No catálogo",
      "eye",
    ],
    [projects.reduce((n, p) => n + p.seasons.length, 0), "Temporadas", "grid"],
    [eps.filter((e) => e.video).length, "Episódios com vídeo", "play"],
  ]
    .map(
      ([n, t, i]) =>
        `<div>${ico(i)}<strong>${n}</strong><span>${t}</span></div>`,
    )
    .join(
      "",
    )}</div><div class="section-head"><h2>Suas produções <span class="count">${projects.length}</span></h2><span>Crie. Organize. Dê o play.</span></div><div class="studio-projects">${projects.map((p) => `<article class="studio-card"><button data-action="edit-project" data-id="${p.id}" class="studio-cover"><img src="${esc(image(p))}" alt="${esc(p.title)}"><span class="status ${p.status}">${p.status === "published" ? "No catálogo" : "Rascunho"}</span></button><div><span class="eyebrow purple">${esc(genreText(p))}${p.demo ? " · DEMONSTRAÇÃO" : ""}</span><h3>${esc(p.title)}</h3><p>${p.seasons.length} temporada${p.seasons.length === 1 ? "" : "s"} <i>·</i> ${episodes(p).length} episódio${episodes(p).length === 1 ? "" : "s"}</p><button class="btn glass full" data-action="edit-project" data-id="${p.id}">${ico("edit")} Gerenciar produção ${ico("arrow")}</button></div></article>`).join("")}<button class="new-project-card" data-action="new-project"><span>${ico("plus")}</span><h3>Uma nova ideia?</h3><p>Dê vida ao seu próximo universo.</p></button></div>`;
}
function membersPage() {
  return `<div class="dashboard-heading"><div><span class="eyebrow purple">EQUIPE E ACESSOS</span><h1>Gente que cria universos<span class="purple">.</span></h1><p>Cadastre membros e escolha quem cria ou assiste.</p></div></div><div class="members-grid"><section class="panel"><h2>${ico("plus")} Novo membro</h2><form id="member-create">${field("Nome", "name", "", "text", 'required maxlength="40" autocomplete="off"')}${field("E-mail", "email", "", "email", 'required autocomplete="off"')}${field("Senha inicial", "password", "", "password", 'required minlength="8" maxlength="200" autocomplete="new-password"')}<label>Nível de acesso<select name="role"><option value="viewer">Telespectador</option><option value="producer">Criador</option></select></label><p class="hint">Entregue a senha inicial ao membro por um canal seguro. Criadores gerenciam projetos e membros; telespectadores assistem e organizam seus perfis.</p><p class="form-error" role="alert"></p><button class="btn full" type="submit">${ico("plus")} Criar membro</button></form></section><section class="panel"><h2>${ico("heart")} Membros <span class="count">${state.members.length}</span></h2><div class="member-list">${state.members.map((m) => `<div class="member-row"><div class="member-identity">${avatar({name:m.name})}<div><strong>${esc(m.name)}</strong><span>${esc(m.email)}</span></div></div><form class="member-role" data-id="${m.id}"><label class="sr-only" for="member-${m.id}">Nível de acesso de ${esc(m.name)}</label><select id="member-${m.id}" name="role" ${m.id === state.user.id ? "disabled" : ""}><option value="viewer" ${m.role === "viewer" ? "selected" : ""}>Telespectador</option><option value="producer" ${m.role === "producer" ? "selected" : ""}>Criador</option></select>${m.id === state.user.id ? '<small>Você</small>' : '<button class="btn glass small" type="submit">Salvar</button>'}<p class="form-error" role="alert"></p></form></div>`).join("")}</div></section></div>`;
}
const field = (label, name, value, type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value) =>
  `<label>${label}<select name="${name}">${options.map((x) => `<option ${x === value ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`;
function uploadField(label, name, value, kind = "image") {
  return `<div class="upload-field"><label>${label}</label><input type="hidden" name="${name}" value="${esc(value)}"><label class="upload-box ${kind === "video" ? "video-upload" : ""}">${value && kind === "image" ? `<img src="${esc(value)}" alt="${esc(label)}">` : ico(kind === "video" ? "film" : "upload")}<span><strong>${value ? "Substituir arquivo" : kind === "video" ? "Enviar episódio" : "Enviar imagem"}</strong><small>${kind === "video" ? `MP4 ou WebM · até ${hosted ? "50 MB" : "2 GB"}` : "JPG, PNG ou WebP · até 10 MB"}</small></span><input type="file" data-upload="${name}" data-kind="${kind}" accept="${kind === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp"}" aria-label="${esc(label)}"></label><span class="upload-status">${value ? "✓ Arquivo selecionado" : ""}</span><progress hidden max="100" value="0"></progress></div>`;
}
function newProject() {
  openModal(
    `<span class="eyebrow purple">DO PAPEL PARA A TELA</span><h2>Um novo universo.</h2><p>Defina a estrutura inicial. Você pode adicionar mais episódios depois.</p><form id="project-create">${field("Nome do desenho", "title", "", "text", 'required maxlength="200" placeholder="Como se chama a sua próxima história?"')}<label>Sinopse<textarea name="description" rows="3" maxlength="3000" placeholder="Toda grande aventura começa com..."></textarea></label><div class="form-grid">${genreChoices()}${select("Classificação indicativa", "rating", ["L", "10", "12", "14", "16", "18"], "L")}${field("Quantas temporadas?", "seasons", 1, "number", 'required min="1" max="20"')}${field("Episódios por temporada", "episodes", 1, "number", 'required min="1" max="100"')}</div>${field("Data de lançamento", "releaseDate", "", "date")}${field("Data programada", "scheduledDate", "", "date")}<p class="hint">Na data programada, o desenho será publicado automaticamente se houver um episódio com vídeo.</p>${uploadField("Capa do desenho", "cover", "")}<p class="form-error" role="alert"></p><button type="submit" class="btn full">Criar projeto ${ico("arrow")}</button></form>`,
    "form-modal",
  );
}
function editor(p) {
  const s = p.seasons.find((x) => x.id === state.season) || p.seasons[0];
  return `<button class="text-button muted" data-action="studio-home">${ico("back")} Todas as produções</button><div class="dashboard-heading"><div><span class="eyebrow purple">GERENCIAR PRODUÇÃO</span><h1>${esc(p.title)}</h1><p>${p.status === "published" ? "Sua história está disponível no catálogo local." : "Prepare sua história. Publique quando estiver pronta."}</p></div><div class="button-row"><span class="status ${p.status}">${p.status === "published" ? "No catálogo" : "Rascunho"}</span><button class="btn ${p.status === "published" ? "glass" : ""}" data-action="publish" data-id="${p.id}">${ico(p.status === "published" ? "edit" : "eye")} ${p.status === "published" ? "Voltar para rascunho" : "Publicar no catálogo"}</button></div></div><div class="editor-grid"><section class="panel"><h2>${ico("film")} Sobre o desenho</h2><form id="project-edit" data-id="${p.id}">${field("Nome do desenho", "title", p.title, "text", 'required maxlength="200"')}<label>Sinopse<textarea name="description" rows="4" maxlength="3000">${esc(p.description)}</textarea></label><div class="form-grid">${genreChoices(genres(p))}${select("Classificação", "rating", ["L", "10", "12", "14", "16", "18"], p.rating)}${field("Data de lançamento", "releaseDate", p.releaseDate || "", "date")}${field("Data programada", "scheduledDate", p.scheduledDate || "", "date")}</div><p class="hint">Na data programada, o desenho será publicado automaticamente se houver um episódio com vídeo. Para cancelar, limpe essa data.</p>${uploadField("Capa do desenho", "cover", p.cover)}${uploadField("Imagem de destaque (horizontal)", "banner", p.banner)}<label class="checkbox"><input type="checkbox" name="featured" ${p.featured ? "checked" : ""}> Destacar na página inicial</label><p class="form-error" role="alert"></p><button class="btn full" type="submit">${ico("check")} Salvar alterações</button></form><button class="text-button danger" data-action="delete-project" data-id="${p.id}">${ico("trash")} Excluir projeto</button></section><section class="panel seasons-panel"><div class="section-head"><h2>Temporadas e episódios</h2><button class="icon" data-action="add-season" data-id="${p.id}" aria-label="Adicionar temporada">${ico("plus")}</button></div><div class="season-tabs">${p.seasons.map((x) => `<button class="chip ${s?.id === x.id ? "selected" : ""}" data-action="edit-season" data-id="${x.id}">Temporada ${x.number}</button>`).join("")}</div>${s ? `<form id="season-edit" data-id="${s.id}">${field("Título da temporada", "title", s.title, "text", "required")}${uploadField("Capa da temporada", "cover", s.cover)}<div class="button-row"><button class="btn glass small" type="submit">Salvar temporada</button><button class="icon danger" type="button" data-action="delete-season" data-id="${s.id}" aria-label="Excluir temporada">${ico("trash")}</button></div><p class="form-error" role="alert"></p></form><div class="section-head episodes-head"><h3>Episódios <span class="count">${s.episodes.length}</span></h3><button class="text-button" data-action="add-episode" data-id="${s.id}">${ico("plus")} Adicionar episódio</button></div><div class="edit-episodes">${s.episodes.map((e) => `<div class="edit-episode"><span class="episode-number">${String(e.number).padStart(2, "0")}</span><img src="${esc(e.cover || s.cover || image(p))}" alt=""><div><h4>${esc(e.title)}</h4><small class="${e.video ? "available" : ""}">${e.video ? "● Vídeo enviado" : "○ Aguardando vídeo"}</small></div><button class="icon" data-action="edit-episode" data-id="${e.id}" aria-label="Editar episódio ${e.number}">${ico("edit")}</button></div>`).join("") || empty("A temporada está esperando sua história.", "Adicione o primeiro episódio.")}</div>` : empty("Seu universo precisa de uma temporada.", "Clique em + para começar.")}</section></div>`;
}
function editEpisode(id) {
  const p = state.studio.find((x) => x.id === state.editing),
    e = episodes(p).find((x) => x.id === id);
  openModal(
    `<span class="eyebrow purple">EPISÓDIO ${e.number}</span><h2>Cada frame conta.</h2><form id="episode-edit" data-id="${e.id}">${field("Título do episódio", "title", e.title, "text", 'required maxlength="200"')}<label>Descrição<textarea name="description" rows="3" maxlength="2000">${esc(e.description)}</textarea></label>${field("Duração em segundos", "duration", e.duration, "number", 'min="0" max="86400"')}${uploadField("Capa do episódio", "cover", e.cover)}${uploadField("Vídeo do episódio", "video", e.video, "video")}<p class="hint">Prefira MP4 com vídeo H.264 e áudio AAC para maior compatibilidade.</p><p class="form-error" role="alert"></p><button type="submit" class="btn full">${ico("check")} Salvar episódio</button><button type="button" class="text-button danger" data-action="delete-episode" data-id="${e.id}">${ico("trash")} Excluir episódio</button></form>`,
    "form-modal",
  );
}
function confirmDelete(kind, id) {
  const text = {
    project: "o projeto e todas as suas temporadas e episódios",
    season: "a temporada e todos os seus episódios",
    episode: "este episódio",
  }[kind];
  openModal(
    `<span class="eyebrow purple">CONFIRMAR EXCLUSÃO</span><h2>Excluir ${kind === "project" ? "projeto" : kind === "season" ? "temporada" : "episódio"}?</h2><p>Você está prestes a excluir ${text}. Essa ação não pode ser desfeita.</p><div class="button-row"><button class="btn glass" data-action="close">Cancelar</button><button class="btn danger-bg" data-action="confirm-delete" data-kind="${kind}" data-id="${id}">Sim, excluir</button></div>`,
    "form-modal",
  );
}
document.addEventListener("click", async (event) => {
  if (
    state.tab === "studio" &&
    $('#app [data-uploading="true"]') &&
    event.target.closest("[data-action], a")
  ) {
    event.preventDefault();
    toast("Aguarde o envio da capa terminar antes de trocar de tela.");
    return;
  }
  if (event.target.closest(".skip")) {
    event.preventDefault();
    const main = $("#main");
    main?.setAttribute("tabindex", "-1");
    main?.focus();
    return;
  }
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const { action, id, value, episode: episodeId } = b.dataset;
  try {
    switch (action) {
      case "hero":
        state.heroId = id;
        render();
        break;
      case "close":
        closeModal();
        if (state.tab === "home") render();
        break;
      case "login":
        authModal();
        break;
      case "register":
        authModal(false, true);
        break;
      case "studio-login":
        authModal(true);
        break;
      case "demo-login": {
        b.disabled = true;
        const producer = b.dataset.role === "producer";
        const d = await api("/login", "POST", {
          email: producer ? "studio@panexus.local" : "visitante@panexus.local",
          password: producer ? "NexusStudio@2026" : "NexusPlay@2026",
          area: producer ? "studio" : "viewer",
        });
        await loggedIn(d, producer);
        break;
      }
      case "profiles":
        if (state.user?.role === "viewer") profilesModal();
        break;
      case "select-profile":
        state.profile = state.profiles.find((p) => p.id === id);
        localStorage.setItem("nexus-profile", id);
        await loadLibrary();
        closeModal();
        render();
        break;
      case "new-profile":
        openModal(
          `<h2>Um novo explorador.</h2><form id="profile-create">${field("Nome do perfil", "name", "", "text", 'required maxlength="24"')}${select("Cor do avatar", "color", ["violet", "coral", "mint", "blue"], "violet")}<p class="form-error" role="alert"></p><button type="submit" class="btn full">Criar perfil</button></form>`,
          "form-modal",
        );
        break;
      case "logout":
        await api("/logout", "POST");
        editorDrafts.clear();
        state.user = null;
        state.profile = null;
        state.profiles = [];
        state.favorites = [];
        state.progress = [];
        closeModal();
        render();
        break;
      case "search":
        state.search = "";
        state.filter = "Todos";
        location.hash = "catalog";
        setTimeout(() => $("#search")?.focus(), 30);
        break;
      case "filter":
        state.filter = value;
        render();
        break;
      case "details":
        details(id);
        break;
      case "play":
        play(id, episodeId);
        break;
      case "next-episode": {
        const eps = episodes(state.catalog.find((x) => x.id === id)).filter(
            (e) => e.video,
          ),
          next = eps[eps.findIndex((e) => e.id === episodeId) + 1];
        if (next) play(id, next.id);
        else toast("Você chegou ao último episódio disponível.");
        break;
      }
      case "favorite":
        if (!state.user) {
          authModal();
          break;
        }
        if (state.user.role !== "viewer") { toast("Entre com uma conta de telespectador para usar Minha lista."); break; }
        const saved = !state.favorites.includes(id);
        await api("/favorites/" + id, "PUT", { saved });
        if (saved) state.favorites.push(id);
        else state.favorites = state.favorites.filter((x) => x !== id);
        b.innerHTML =
          ico(saved ? "check" : "plus") +
          (b.classList.contains("btn") ? " Minha lista" : "");
        b.classList.toggle("saved", saved);
        toast(saved ? "Adicionado à sua lista." : "Removido da sua lista.");
        if (!$("#modal").open) render();
        break;
      case "studio-home":
        state.studioView = "projects";
        state.editing = null;
        render();
        break;
      case "studio-members":
        state.studioView = "members";
        await refreshMembers();
        render();
        break;
      case "new-project":
        state.studioView = "projects";
        newProject();
        break;
      case "edit-project":
        state.studioView = "projects";
        state.editing = id;
        state.season = null;
        render();
        window.scrollTo(0, 0);
        break;
      case "edit-season":
        state.season = id;
        render();
        break;
      case "edit-episode":
        editEpisode(id);
        break;
      case "add-season": {
        const s = await api("/studio/projects/" + id + "/seasons", "POST", {});
        state.season = s.id;
        await refreshStudio();
        render();
        toast("Temporada adicionada.");
        break;
      }
      case "add-episode":
        await api("/studio/seasons/" + id + "/episodes", "POST", {});
        await refreshStudio();
        render();
        toast("Episódio adicionado.");
        break;
      case "publish": {
        const p = state.studio.find((x) => x.id === id);
        await api("/studio/projects/" + id, "PUT", {
          status: p.status === "published" ? "draft" : "published",
        });
        await refreshStudio();
        render();
        toast(
          p.status === "published"
            ? "Projeto movido para rascunho."
            : "Sua produção já está no catálogo local!",
        );
        break;
      }
      case "delete-project":
      case "delete-season":
      case "delete-episode":
        confirmDelete(action.split("-")[1], id);
        break;
      case "confirm-delete": {
        const kind = b.dataset.kind;
        await api(
          "/studio/" +
            { project: "projects", season: "seasons", episode: "episodes" }[
              kind
            ] +
            "/" +
            id,
          "DELETE",
        );
        if (kind === "project") state.editing = null;
        if (kind === "season") state.season = null;
        closeModal();
        await refreshStudio();
        render();
        toast("Exclusão concluída.");
        break;
      }
    }
  } catch (e) {
    toast(e.message);
    b.disabled = false;
  }
});
async function loggedIn(d, studio) {
  if (d.user.role !== (studio ? "producer" : "viewer")) throw new Error("Esta conta não tem acesso a esta área.");
  state.user = d.user;
  state.profiles = d.profiles;
  state.profile = studio ? null : d.profiles[0];
  if (state.profile) localStorage.setItem("nexus-profile", state.profile.id);
  if (!studio) await loadLibrary();
  closeModal();
  if (studio) {
    state.studioView = "projects";
    await refreshStudio();
    location.hash = "studio";
    render();
  } else {
    if (state.tab === "studio") location.hash = "home";
    render();
    profilesModal();
  }
}
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!form.id && !form.classList.contains("member-role")) return;
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  const error = form.querySelector(".form-error");
  if (error) error.textContent = "";
  if (
    form.querySelector('[data-uploading="true"]') ||
    $('#app [data-uploading="true"]')
  ) {
    if (error) error.textContent = "Aguarde o envio dos arquivos terminar.";
    return;
  }
  if (submit) submit.disabled = true;
  try {
    const formData = new FormData(form);
    const d = Object.fromEntries(formData);
    if (form.id === "project-create" || form.id === "project-edit")
      d.genres = formData.getAll("genres");
    switch (form.classList.contains("member-role") ? "member-role" : form.id) {
      case "auth-form": {
        d.area = form.dataset.producer === "true" ? "studio" : "viewer";
        const data = await api(
          form.dataset.register === "true" ? "/register" : "/login",
          "POST",
          d,
        );
        await loggedIn(data, form.dataset.producer === "true");
        break;
      }
      case "member-create":
        await api("/studio/members", "POST", d);
        await refreshMembers();
        render();
        toast("Membro criado.");
        break;
      case "member-role":
        await api("/studio/members/" + form.dataset.id, "PUT", d);
        await refreshMembers();
        render();
        toast("Acesso atualizado. O membro deverá entrar novamente.");
        break;
      case "profile-create": {
        const p = await api("/profiles", "POST", d);
        state.profiles.push(p);
        profilesModal();
        break;
      }
      case "project-create": {
        const p = await api("/studio/projects", "POST", d);
        state.editing = p.id;
        state.season = null;
        await refreshStudio();
        closeModal();
        render();
        toast("Seu novo universo está pronto para criar.");
        break;
      }
      case "project-edit":
        d.featured = !!d.featured;
        await api("/studio/projects/" + form.dataset.id, "PUT", d);
        editorDrafts.forget(form);
        await refreshStudio();
        render();
        toast("Alterações salvas.");
        break;
      case "season-edit":
        await api("/studio/seasons/" + form.dataset.id, "PUT", d);
        editorDrafts.forget(form);
        await refreshStudio();
        render();
        toast("Temporada salva.");
        break;
      case "episode-edit":
        await api("/studio/episodes/" + form.dataset.id, "PUT", d);
        await refreshStudio();
        closeModal();
        render();
        toast("Episódio salvo.");
        break;
    }
  } catch (e) {
    if (error) error.textContent = e.message;
    else toast(e.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("input", (e) => {
  if (e.target.type !== "file") editorDrafts.remember(e.target.closest("form"));
  if (e.target.id === "search") {
    state.search = e.target.value;
    const cursor = e.target.selectionStart;
    const results =
      state.tab === "list"
        ? state.catalog.filter((p) => state.favorites.includes(p.id))
        : state.catalog;
    const filtered = results.filter(
      (p) =>
        (state.filter === "Todos" || hasGenre(p, state.filter)) &&
        `${p.title} ${genreText(p)} ${p.description}`
          .toLocaleLowerCase()
          .includes(state.search.toLocaleLowerCase()),
    );
    $("#catalog-results").innerHTML =
      filtered.map((p) => card(p)).join("") ||
      empty("Nenhum universo encontrado.", "Tente outro título ou gênero.");
  }
});
document.addEventListener("change", async (e) => {
  const input = e.target;
  if (input.type !== "file") editorDrafts.remember(input.closest("form"));
  if (input.id === "genre-filter") {
    state.filter = input.value;
    render();
  }
  if (input.id === "season-select") details(input.dataset.id, input.value);
  if (input.dataset.upload) {
    const file = input.files[0];
    if (!file) return;
    const box = input.closest(".upload-field"),
      status = $(".upload-status", box),
      progress = $("progress", box),
      form = input.closest("form");
    if (
      file.size >
      (input.dataset.kind === "video" ? (hosted ? 50 * 1024 ** 2 : 2 * 1024 ** 3) : 10 * 1024 ** 2)
    ) {
      status.textContent = "Arquivo maior que o limite permitido.";
      input.value = "";
      return;
    }
    input.dataset.uploading = "true";
    input.disabled = true;
    progress.hidden = false;
    status.textContent = "Enviando...";
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/studio/upload?kind=" + input.dataset.kind);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        progress.value = (e.loaded / e.total) * 100;
        status.textContent = `Enviando ${Math.round(progress.value)}%`;
      }
    };
    xhr.onload = () => {
      delete input.dataset.uploading;
      input.disabled = false;
      progress.hidden = true;
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) throw new Error(d.error);
        $(`input[name="${input.dataset.upload}"]`, box).value = d.url;
        editorDrafts.remember(form);
        status.textContent = "✓ Enviado. Salve para aplicar.";
        $(".upload-box strong", box).textContent = "Substituir arquivo";
        if (input.dataset.kind === "image") {
          let img = $("img", box);
          if (!img) {
            img = document.createElement("img");
            img.alt = "Prévia da capa";
            $(".upload-box", box).prepend(img);
            $(".upload-box > svg", box)?.remove();
          }
          img.src = d.url;
        } else {
          const v = document.createElement("video");
          v.preload = "metadata";
          const url = URL.createObjectURL(file);
          v.onloadedmetadata = () => {
            const duration = $('[name="duration"]', form);
            if (duration && Number.isFinite(v.duration))
              duration.value = Math.ceil(v.duration);
            URL.revokeObjectURL(url);
          };
          v.onerror = () => URL.revokeObjectURL(url);
          v.src = url;
        }
      } catch (err) {
        status.textContent = err.message;
      }
      input.value = "";
    };
    xhr.onerror = () => {
      delete input.dataset.uploading;
      input.disabled = false;
      progress.hidden = true;
      status.textContent = "Falha no envio. Tente novamente.";
      input.value = "";
    };
    const data = new FormData();
    data.append("file", file);
    xhr.send(data);
  }
});
window.addEventListener("hashchange", async () => {
  closeModal();
  state.filter = "Todos";
  state.search = "";
  if (location.hash === "#studio" && state.user?.role === "producer") {
    try {
      await refreshStudio();
    } catch (e) {
      toast(e.message);
    }
  }
  render();
  window.scrollTo(0, 0);
});
async function init() {
  try {
    const [session, catalog] = await Promise.all([
      api("/session"),
      api("/catalog"),
    ]);
    Object.assign(state, session);
    state.catalog = catalog;
    state.profile = state.user?.role === "viewer" ?
      state.profiles.find(
        (p) => p.id === localStorage.getItem("nexus-profile"),
      ) ||
      state.profiles[0] ||
      null : null;
    await loadLibrary();
    if (state.user?.role === "producer") await refreshStudio();
    render();
  } catch (e) {
    $("#app").innerHTML = empty(
      "Não foi possível abrir este universo.",
      esc(e.message) + " Recarregue a página para tentar novamente.",
    );
  }
}
init();

window.addEventListener("pagehide", saveProgress);
