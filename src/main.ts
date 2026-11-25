import { createColorField, createPaletteEditor } from "./colorInputs";
import { ExportPanel } from "./exportPanel";
import {
  createGlowBlobs,
  createPieces,
  type GlowBlob,
  type Piece,
} from "./objectCell";
import { randomSeed } from "./random";
import { Scene, type Look } from "./scene";
import { element, errorText } from "./ui";

const MAX_PREVIEW_SIZE = 1024;

const preview = element<HTMLCanvasElement>("preview");
const stageMessage = element<HTMLParagraphElement>("stage-message");
const slicesInput = element<HTMLSelectElement>("slices");
const piecesInput = element<HTMLInputElement>("pieces");
const piecesValue = element<HTMLOutputElement>("pieces-value");
const rotationInput = element<HTMLInputElement>("rotation");
const shadeVarietyInput = element<HTMLInputElement>("shade-variety");
const glowInput = element<HTMLInputElement>("glow");
const focusInput = element<HTMLInputElement>("focus");
const blurInput = element<HTMLInputElement>("blur");
const borderWidthInput = element<HTMLInputElement>("border-width");
const loopSecondsInput = element<HTMLInputElement>("loop-seconds");
const loopSecondsValue = element<HTMLOutputElement>("loop-seconds-value");

let seed = randomSeed();
let palette = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"];
let background = "#14101f";
let borderColor = "#111111";
let pieces: Piece[] = [];
let blobs: GlowBlob[] = [];

function regeneratePieces(): void {
  pieces = createPieces(seed, Number(piecesInput.value));
}

function regeneratePattern(): void {
  regeneratePieces();
  blobs = createGlowBlobs(seed);
}

function sliderFraction(input: HTMLInputElement): number {
  return Number(input.value) / 100;
}

function currentLook(): Look {
  return {
    pieces,
    blobs,
    palette,
    shadeVariety: sliderFraction(shadeVarietyInput),
    background,
    glow: sliderFraction(glowInput),
    focus: sliderFraction(focusInput),
    blur: sliderFraction(blurInput),
    borderColor,
    borderWidth: sliderFraction(borderWidthInput),
    slices: Number(slicesInput.value),
    cellTurns: rotationInput.checked ? 1 : 0,
  };
}

function updateLabels(): void {
  piecesValue.value = piecesInput.value;
  loopSecondsValue.value = `${loopSecondsInput.value} s`;
}

function showStageMessage(text: string): void {
  preview.hidden = true;
  stageMessage.textContent = text;
  stageMessage.hidden = false;
}

const exportPanel = new ExportPanel({
  currentLook,
  fileStem: () => `kaleidoscope-${seed}`,
  loopSeconds: () => Number(loopSecondsInput.value),
});
loopSecondsInput.addEventListener("input", () => exportPanel.refreshSummary());

function startPreview(): void {
  let scene: Scene;
  try {
    scene = new Scene(preview);
  } catch (error) {
    showStageMessage(errorText(error));
    exportPanel.disable();
    return;
  }
  let phase = 0;
  let lastNow: number | null = null;
  let animating = false;
  let contextLost = false;
  const draw = (): void => scene.draw(currentLook(), phase);

  preview.addEventListener("webglcontextlost", () => {
    contextLost = true;
    showStageMessage(
      "The preview stopped because the graphics card was reset. Reload the page to start it again.",
    );
  });

  function animate(now: number): void {
    if (contextLost) return;
    if (lastNow !== null) {
      const loopMs = Number(loopSecondsInput.value) * 1000;
      phase = (phase + (now - lastNow) / loopMs) % 1;
    }
    lastNow = now;
    draw();
    requestAnimationFrame(animate);
  }

  new ResizeObserver(([entry]) => {
    const cssSize = Math.min(entry.contentRect.width, entry.contentRect.height);
    const size = Math.min(
      MAX_PREVIEW_SIZE,
      Math.round(cssSize * devicePixelRatio),
    );
    if (size === 0) return;
    scene.resize(size);
    // Resizing clears the canvas after this frame was already drawn; without a redraw it paints blank.
    draw();
    if (!animating) {
      animating = true;
      requestAnimationFrame(animate);
    }
  }).observe(preview);
}

createPaletteEditor(element("palette"), palette, (colors) => {
  palette = colors;
});
element("background").append(
  createColorField(background, "Background", (hex) => {
    background = hex;
  }),
);
element("border-color").append(
  createColorField(borderColor, "Border color", (hex) => {
    borderColor = hex;
  }),
);

piecesInput.addEventListener("input", () => {
  regeneratePieces();
  updateLabels();
});
element("new-pattern").addEventListener("click", () => {
  seed = randomSeed();
  regeneratePattern();
});
loopSecondsInput.addEventListener("input", updateLabels);

regeneratePattern();
updateLabels();
startPreview();
