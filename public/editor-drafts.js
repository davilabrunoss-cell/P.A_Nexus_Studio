// Drafts belong to one entity, never to the shared field name "cover".
// They live only for the current page session; Save is still explicit.
export class EditorDrafts {
  #drafts = new Map();

  key(form) {
    return form?.dataset.id && ["project-edit", "season-edit"].includes(form.id)
      ? `${form.id}:${form.dataset.id}`
      : null;
  }

  remember(form) {
    const key = this.key(form);
    if (!key) return;
    const values = {};
    for (const field of form.elements) {
      if (!field.name || field.type === "file") continue;
      if (field.type === "checkbox" && form.querySelectorAll(`[name="${field.name}"]`).length > 1) {
        values[field.name] ??= [];
        if (field.checked) values[field.name].push(field.value);
      } else values[field.name] = field.type === "checkbox" ? field.checked : field.value;
    }
    this.#drafts.set(key, values);
  }

  forget(form) {
    this.#drafts.delete(this.key(form));
  }

  clear() {
    this.#drafts.clear();
  }

  restore(root) {
    for (const form of root.querySelectorAll("#project-edit, #season-edit")) {
      const values = this.#drafts.get(this.key(form));
      if (!values) continue;
      for (const field of form.elements) {
        if (!Object.hasOwn(values, field.name) || field.type === "file")
          continue;
        if (field.type === "checkbox") field.checked = Array.isArray(values[field.name])
          ? values[field.name].includes(field.value) : values[field.name];
        else field.value = values[field.name];
      }
      for (const box of form.querySelectorAll(".upload-field")) {
        const field = box.querySelector('input[type="hidden"]');
        const picker = box.querySelector("[data-upload]");
        if (!field?.value || picker?.dataset.kind !== "image") continue;
        let image = box.querySelector("img");
        if (!image) {
          image = root.ownerDocument.createElement("img");
          image.alt = picker.getAttribute("aria-label") || "Prévia da capa";
          box.querySelector(".upload-box").prepend(image);
          box.querySelector(".upload-box > svg")?.remove();
        }
        image.src = field.value;
        box.querySelector(".upload-box strong").textContent =
          "Substituir arquivo";
      }
      const status = form.querySelector(".draft-status");
      if (status)
        status.textContent =
          "Alterações preservadas. Salve este formulário para aplicar.";
    }
  }
}
