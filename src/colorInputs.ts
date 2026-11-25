const MIN_COLORS = 2;
const MAX_COLORS = 6;
const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(text: string): string | null {
  const match = HEX_PATTERN.exec(text.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return digits.length === 3
    ? `#${[...digits].map((digit) => digit + digit).join("")}`
    : `#${digits}`;
}

function randomHex(): string {
  return `#${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0")}`;
}

export function createColorField(
  initial: string,
  label: string,
  onChange: (hex: string) => void,
): HTMLElement {
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = initial;
  picker.setAttribute("aria-label", `${label} picker`);

  const text = document.createElement("input");
  text.type = "text";
  text.value = initial;
  text.spellcheck = false;
  text.setAttribute("aria-label", `${label} hex code`);

  picker.addEventListener("input", () => {
    text.value = picker.value;
    text.classList.remove("invalid");
    onChange(picker.value);
  });
  text.addEventListener("input", () => {
    const hex = normalizeHex(text.value);
    text.classList.toggle("invalid", hex === null);
    if (hex) {
      picker.value = hex;
      onChange(hex);
    }
  });
  text.addEventListener("blur", () => {
    text.value = picker.value;
    text.classList.remove("invalid");
  });

  const field = document.createElement("div");
  field.className = "color-field";
  field.append(picker, text);
  return field;
}

export function createPaletteEditor(
  container: HTMLElement,
  initial: readonly string[],
  onChange: (palette: string[]) => void,
): void {
  const colors = [...initial];
  const rows = document.createElement("div");
  rows.className = "palette-rows";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add color";
  addButton.addEventListener("click", () => {
    colors.push(randomHex());
    render();
    onChange([...colors]);
  });

  function render(): void {
    rows.replaceChildren(
      ...colors.map((color, i) => {
        const field = createColorField(color, `Color ${i + 1}`, (hex) => {
          colors[i] = hex;
          onChange([...colors]);
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-color";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove color ${i + 1}`);
        remove.disabled = colors.length <= MIN_COLORS;
        remove.addEventListener("click", () => {
          colors.splice(i, 1);
          render();
          onChange([...colors]);
        });

        const row = document.createElement("div");
        row.className = "palette-row";
        row.append(field, remove);
        return row;
      }),
    );
    addButton.disabled = colors.length >= MAX_COLORS;
  }

  render();
  container.append(rows, addButton);
}
