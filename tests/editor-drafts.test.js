import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { EditorDrafts } from "../public/editor-drafts.js";

function editor(season = "s1") {
  return ["project-edit:p1", `season-edit:${season}`]
    .map((key) => {
      const [id, entity] = key.split(":");
      return `<form id="${id}" data-id="${entity}"><input name="title" value="Original"><input name="featured" type="checkbox"><div class="upload-field"><input type="hidden" name="cover" value="/assets/brand.jpeg"><label class="upload-box"><img src="/assets/brand.jpeg"><strong>Substituir arquivo</strong><input type="file" data-upload="cover" data-kind="image"></label></div><p class="draft-status"></p></form>`;
    })
    .join("");
}
test("salvar desenho não descarta capa e título pendentes da temporada", () => {
  const dom = new JSDOM(`<main>${editor()}</main>`),
    root = dom.window.document.querySelector("main");
  const drafts = new EditorDrafts();
  const project = root.querySelector("#project-edit"),
    season = root.querySelector("#season-edit");
  project.elements.cover.value = "/assets/aurora.png";
  season.elements.cover.value = "/assets/bosque.png";
  season.elements.title.value = "A floresta";
  drafts.remember(project);
  drafts.remember(season);
  drafts.forget(project); // Only the project save succeeded.
  root.innerHTML = editor();
  drafts.restore(root);
  assert.equal(
    root.querySelector("#season-edit").elements.cover.value,
    "/assets/bosque.png",
  );
  assert.equal(
    root.querySelector("#season-edit img").getAttribute("src"),
    "/assets/bosque.png",
  );
  assert.equal(
    root.querySelector("#season-edit").elements.title.value,
    "A floresta",
  );
  assert.equal(
    root.querySelector("#project-edit").elements.cover.value,
    "/assets/brand.jpeg",
  );
});
test("salvar temporada preserva rascunho do desenho; temporadas não compartilham capas", () => {
  const dom = new JSDOM(`<main>${editor()}</main>`),
    root = dom.window.document.querySelector("main");
  const drafts = new EditorDrafts();
  const project = root.querySelector("#project-edit"),
    season = root.querySelector("#season-edit");
  project.elements.cover.value = "/assets/neon.png";
  project.elements.featured.checked = true;
  season.elements.cover.value = "/assets/bosque.png";
  drafts.remember(project);
  drafts.remember(season);
  root.innerHTML = editor("s2");
  drafts.restore(root);
  assert.equal(
    root.querySelector("#season-edit").elements.cover.value,
    "/assets/brand.jpeg",
  );
  const second = root.querySelector("#season-edit");
  second.elements.cover.value = "/assets/orbita.png";
  drafts.remember(second);
  root.innerHTML = editor();
  drafts.restore(root);
  assert.equal(
    root.querySelector("#season-edit").elements.cover.value,
    "/assets/bosque.png",
  );
  drafts.forget(root.querySelector("#season-edit"));
  root.innerHTML = editor();
  drafts.restore(root);
  assert.equal(
    root.querySelector("#project-edit").elements.cover.value,
    "/assets/neon.png",
  );
  assert.equal(
    root.querySelector("#project-edit").elements.featured.checked,
    true,
  );
  drafts.clear();
  root.innerHTML = editor();
  drafts.restore(root);
  assert.equal(
    root.querySelector("#project-edit").elements.cover.value,
    "/assets/brand.jpeg",
  );
});
test("vários gêneros marcados permanecem no rascunho após redesenhar o editor", () => {
  const markup = `<main><form id="project-edit" data-id="p1"><input type="checkbox" name="genres" value="Terror"><input type="checkbox" name="genres" value="Suspense"><input type="checkbox" name="genres" value="Aventura"><p class="draft-status"></p></form></main>`;
  const dom = new JSDOM(markup), root = dom.window.document.querySelector("main");
  const drafts = new EditorDrafts();
  root.querySelector('[value="Terror"]').checked = true;
  root.querySelector('[value="Suspense"]').checked = true;
  drafts.remember(root.querySelector("form"));
  root.innerHTML = new JSDOM(markup).window.document.querySelector("main").innerHTML;
  drafts.restore(root);
  assert.equal(root.querySelector('[value="Terror"]').checked, true);
  assert.equal(root.querySelector('[value="Suspense"]').checked, true);
  assert.equal(root.querySelector('[value="Aventura"]').checked, false);
});
