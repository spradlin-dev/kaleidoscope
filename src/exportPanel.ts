import {
  planExport,
  type ExportFormat,
  type ExportJob,
  type ExportProgress,
} from "./exportFrames";
import { gifFormat } from "./gifExport";
import { mp4Format } from "./mp4Export";
import type { Look } from "./scene";
import { element, errorText } from "./ui";
import { webpFormat } from "./webpExport";

const FORMATS: Record<string, ExportFormat> = {
  gif: gifFormat,
  mp4: mp4Format,
  webp: webpFormat,
};

export interface ExportSource {
  currentLook: () => Look;
  /** File name without the extension. */
  fileStem: () => string;
  loopSeconds: () => number;
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export class ExportPanel {
  private readonly source: ExportSource;
  private readonly formatInput = element<HTMLSelectElement>("export-format");
  private readonly sizeInput = element<HTMLSelectElement>("export-size");
  private readonly fpsInput = element<HTMLSelectElement>("export-fps");
  private readonly summary = element<HTMLParagraphElement>("export-summary");
  private readonly startButton = element<HTMLButtonElement>("export-start");
  private readonly cancelButton = element<HTMLButtonElement>("export-cancel");
  private readonly progress = element<HTMLProgressElement>("export-progress");
  private readonly status = element<HTMLParagraphElement>("export-status");
  private readonly result = element<HTMLDivElement>("export-result");
  private readonly image = element<HTMLImageElement>("export-image");
  private readonly video = element<HTMLVideoElement>("export-video");
  private readonly link = element<HTMLAnchorElement>("export-link");
  private resultUrl: string | null = null;
  private controller: AbortController | null = null;
  private canRender = true;

  constructor(source: ExportSource) {
    this.source = source;
    for (const [id, format] of Object.entries(FORMATS)) {
      this.formatInput.append(new Option(format.label, id));
    }
    for (const input of [this.formatInput, this.fpsInput]) {
      input.addEventListener("input", () => this.refreshSummary());
    }
    this.startButton.addEventListener("click", () => void this.run());
    this.cancelButton.addEventListener("click", () => this.controller?.abort());
    this.refreshSummary();
    void this.markUnavailableFormats();
  }

  /** For when the preview can't draw: exports would fail the same way. */
  disable(): void {
    this.canRender = false;
    this.startButton.disabled = true;
  }

  refreshSummary(): void {
    const format = this.selectedFormat();
    const { frameCount } = this.job(format);
    this.summary.textContent = format.loopsByItself
      ? `${frameCount} frames, loops forever`
      : `${frameCount} frames. A video loops only when the player repeats it.`;
  }

  private selectedFormat(): ExportFormat {
    return FORMATS[this.formatInput.value];
  }

  private job(format: ExportFormat): ExportJob {
    const options = {
      size: Number(this.sizeInput.value),
      fps: Number(this.fpsInput.value),
      seconds: this.source.loopSeconds(),
    };
    return planExport(options, format.delayStepMs);
  }

  private async markUnavailableFormats(): Promise<void> {
    for (const option of Array.from(this.formatInput.options)) {
      const format = FORMATS[option.value];
      const available = await format.isAvailable().catch(() => false);
      if (!available) {
        option.disabled = true;
        option.text = `${format.label} (not available in this browser)`;
      }
    }
    // Someone may have picked a format before its check finished.
    const options = Array.from(this.formatInput.options);
    const firstAvailable = options.find((option) => !option.disabled);
    if (this.formatInput.selectedOptions[0]?.disabled && firstAvailable) {
      this.formatInput.value = firstAvailable.value;
      this.refreshSummary();
    }
  }

  private async run(): Promise<void> {
    const format = this.selectedFormat();
    if (this.formatInput.selectedOptions[0]?.disabled) {
      this.status.textContent = `${format.label} isn't available in this browser.`;
      return;
    }
    const controller = new AbortController();
    const fileName = `${this.source.fileStem()}.${format.extension}`;
    this.controller = controller;
    this.setBusy(true);
    this.status.textContent = "Rendering frames…";
    try {
      const file = await format.encode(
        this.source.currentLook(),
        this.job(format),
        (progress) => this.showProgress(progress),
        controller.signal,
      );
      // A Cancel pressed while the file was being finished still counts.
      controller.signal.throwIfAborted();
      this.showResult(file, fileName, format);
    } catch (error) {
      this.status.textContent = controller.signal.aborted
        ? "Export cancelled."
        : `Export failed: ${errorText(error)}`;
    } finally {
      this.controller = null;
      this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    this.startButton.disabled = busy || !this.canRender;
    this.cancelButton.hidden = !busy;
    this.progress.hidden = !busy;
    if (busy) this.progress.value = 0;
  }

  private showProgress(progress: ExportProgress): void {
    this.progress.value = progress.framesDone / progress.frameCount;
    const estimate =
      progress.estimatedBytes === null
        ? ""
        : ` Estimated file size: about ${megabytes(progress.estimatedBytes)}.`;
    this.status.textContent = `Frame ${progress.framesDone} of ${progress.frameCount}.${estimate}`;
  }

  private showResult(file: Blob, fileName: string, format: ExportFormat): void {
    if (this.resultUrl) URL.revokeObjectURL(this.resultUrl);
    this.resultUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    this.image.hidden = isVideo;
    this.video.hidden = !isVideo;
    if (isVideo) {
      this.image.removeAttribute("src");
      this.video.src = this.resultUrl;
    } else {
      this.video.removeAttribute("src");
      this.video.load();
      this.image.src = this.resultUrl;
    }
    this.link.href = this.resultUrl;
    this.link.download = fileName;
    this.link.textContent = `Download ${format.label}`;
    this.result.hidden = false;
    this.status.textContent = `Done: ${megabytes(file.size)}`;
  }
}
