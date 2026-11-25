import { createColorField, createPaletteEditor } from "./colorInputs";
import {
  exportGif,
  gifFrameCount,
  type ExportProgress,
  type GifOptions,
} from "./gifExport";
import { createPieces, type Piece } from "./objectCell";
import { randomSeed } from "./random";
import { Scene, type Look } from "./scene";

const MAX_PREVIEW_SIZE = 1024;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`The page is missing #${id}.`);
  return found as T;
}

const preview = element<HTMLCanvasElement>("preview");
const stageMessage = element<HTMLParagraphElement>("stage-message");
const slicesInput = element<HTMLSelectElement>("slices");
const piecesInput = element<HTMLInputElement>("pieces");
const piecesValue = element<HTMLOutputElement>("pieces-value");
const cellTurnsInput = element<HTMLSelectElement>("cell-turns");
const loopSecondsInput = element<HTMLInputElement>("loop-seconds");
const loopSecondsValue = element<HTMLOutputElement>("loop-seconds-value");
const gifSizeInput = element<HTMLSelectElement>("gif-size");
const gifFpsInput = element<HTMLSelectElement>("gif-fps");
const gifSummary = element<HTMLParagraphElement>("gif-summary");
const exportButton = element<HTMLButtonElement>("export-gif");
const cancelButton = element<HTMLButtonElement>("cancel-export");
const exportProgress = element<HTMLProgressElement>("export-progress");
const exportStatus = element<HTMLParagraphElement>("export-status");
const exportResult = element<HTMLDivElement>("export-result");
const exportImage = element<HTMLImageElement>("export-image");
const exportLink = element<HTMLAnchorElement>("export-link");

let seed = randomSeed();
let palette = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"];
let background = "#14101f";
let pieces: Piece[] = [];
let exportUrl: string | null = null;
let exportController: AbortController | null = null;

function regeneratePieces(): void {
  pieces = createPieces(seed, Number(piecesInput.value));
}

function currentLook(): Look {
  return {
    pieces,
    palette,
    background,
    slices: Number(slicesInput.value),
    cellTurns: Number(cellTurnsInput.value),
  };
}

function gifOptions(): GifOptions {
  return {
    size: Number(gifSizeInput.value),
    fps: Number(gifFpsInput.value),
    seconds: Number(loopSecondsInput.value),
  };
}

function updateLabels(): void {
  piecesValue.value = piecesInput.value;
  loopSecondsValue.value = `${loopSecondsInput.value} s`;
  gifSummary.textContent = `${gifFrameCount(gifOptions())} frames, loops forever`;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showStageMessage(text: string): void {
  preview.hidden = true;
  stageMessage.textContent = text;
  stageMessage.hidden = false;
}

function showExportProgress(progress: ExportProgress): void {
  exportProgress.value = progress.framesDone / progress.frameCount;
  exportStatus.textContent = `Frame ${progress.framesDone} of ${progress.frameCount}. Estimated file size: about ${megabytes(progress.estimatedBytes)}.`;
}

function showExportResult(gif: Blob, fileName: string): void {
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = URL.createObjectURL(gif);
  exportImage.src = exportUrl;
  exportLink.href = exportUrl;
  exportLink.download = fileName;
  exportResult.hidden = false;
  exportStatus.textContent = `Done: ${megabytes(gif.size)}`;
}

async function runExport(): Promise<void> {
  const controller = new AbortController();
  exportController = controller;
  const fileName = `kaleidoscope-${seed}.gif`;
  exportButton.disabled = true;
  cancelButton.hidden = false;
  exportProgress.value = 0;
  exportProgress.hidden = false;
  exportStatus.textContent = "Rendering frames…";
  try {
    const gif = await exportGif(
      currentLook(),
      gifOptions(),
      showExportProgress,
      controller.signal,
    );
    showExportResult(gif, fileName);
  } catch (error) {
    exportStatus.textContent = controller.signal.aborted
      ? "Export cancelled."
      : `Export failed: ${errorText(error)}`;
  } finally {
    exportController = null;
    exportButton.disabled = false;
    cancelButton.hidden = true;
    exportProgress.hidden = true;
  }
}

function startPreview(): void {
  let scene: Scene;
  try {
    scene = new Scene(preview);
  } catch (error) {
    showStageMessage(errorText(error));
    exportButton.disabled = true;
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

piecesInput.addEventListener("input", () => {
  regeneratePieces();
  updateLabels();
});
element("new-pattern").addEventListener("click", () => {
  seed = randomSeed();
  regeneratePieces();
});
for (const input of [loopSecondsInput, gifFpsInput]) {
  input.addEventListener("input", updateLabels);
}
exportButton.addEventListener("click", runExport);
cancelButton.addEventListener("click", () => exportController?.abort());

regeneratePieces();
updateLabels();
startPreview();
