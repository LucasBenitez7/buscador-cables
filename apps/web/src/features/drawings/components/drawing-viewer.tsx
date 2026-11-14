"use client";

import { cn } from "cn";
import { Maximize2Icon, Minimize2Icon, MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type OpenSeadragon from "openseadragon";
import type { Viewer } from "openseadragon";
import type { DrawingMark } from "@cables/shared";
import { Button } from "@/components/ui/button";

/** A point to highlight on the sheet. `emphasis` ones get the arrow and the zoom. */
export type ViewerMark = DrawingMark & {
  /** Short text next to the mark ("1", "Aquí"): route steps are numbered. */
  label?: string;
  tone?: "primary" | "success" | "warning" | "muted";
};

type Props = {
  imageKey: string;
  /** Size of the sheet in points: gives its proportions. */
  width: number;
  height: number;
  marks: ViewerMark[];
  /** Accessible name of the drawing ("Plano EJ-ELE-DRW-0024, hoja 03"). */
  label: string;
};

type OpenSeadragonModule = typeof OpenSeadragon;

/** Marks the eye should go to: the drawn code or the section flag, not the table rows. */
const isPrimary = (mark: ViewerMark) => mark.kind !== "table";

const TONE_FRAME: Record<NonNullable<ViewerMark["tone"]>, string> = {
  primary: "border-warning bg-warning/15",
  warning: "border-warning bg-warning/15",
  success: "border-success bg-success/10",
  muted: "border-muted-foreground bg-muted-foreground/10",
};

/** The arrow and the pulse go only to what is being looked for (on a route, where it is). */
const isHighlighted = (mark: ViewerMark) =>
  mark.kind !== "table" && (mark.tone ?? "primary") !== "success" && mark.tone !== "muted";

/** Without a stored size (older data), a small square around the point. */
const DEFAULT_SIZE = { w: 0.012, h: 0.008 };

/**
 * Where a mark sits on the image, in OpenSeadragon's coordinates (the width is 1, the height
 * follows the sheet): a frame around the text with a margin, so it fits whatever it marks
 * and grows and shrinks with the drawing.
 */
export function markFrame(mark: ViewerMark, aspect: number) {
  const w = mark.w ?? DEFAULT_SIZE.w;
  const h = mark.h ?? DEFAULT_SIZE.h;
  // Margin of half a line of text around it; the flags' boxes are a bit larger than their number.
  const pad = h * (mark.kind === "flag" ? 0.7 : 0.35);
  const width = w + pad * 2;
  const height = h + pad * 2;
  return {
    x: mark.x - width / 2,
    y: (mark.y - height / 2) * aspect,
    width,
    height: height * aspect,
  };
}

/** Built by hand: OpenSeadragon owns the DOM of its overlays. */
function frameElement(mark: ViewerMark): HTMLElement {
  const element = document.createElement("div");
  element.dataset.mark = mark.kind;
  element.dataset.tone = mark.tone ?? "primary";
  element.className = cn(
    "pointer-events-none rounded-sm",
    TONE_FRAME[mark.tone ?? "primary"],
    isHighlighted(mark) ? "border-[3px]" : "border-2",
    mark.kind === "table" && "border-dashed",
  );
  return element;
}

/** Fixed size on screen: found at a glance even with the whole sheet in view. */
function arrowElement(): HTMLElement {
  const element = document.createElement("div");
  element.className = "pointer-events-none pb-1";
  element.dataset.arrow = "";
  element.innerHTML = `<svg class="size-9 drop-shadow text-warning" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" stroke="black" stroke-width="0.6" d="M12 22 4 12h5V2h6v10h5z"/>
    </svg>`;
  return element;
}

/**
 * The step number. With the sheet far away the numbers of neighbouring trays would pile up:
 * then only the one of what is being looked for stays (see `FAR_WIDTH`).
 */
function labelElement(label: string, keep: boolean): HTMLElement {
  const element = document.createElement("span");
  element.className = cn(
    "pointer-events-none ml-1 rounded-full bg-background px-1.5 text-xs font-bold text-foreground shadow",
    !keep && "group-data-[far=true]/viewer:invisible",
  );
  element.textContent = label;
  return element;
}

/** Below this width on screen (pixels) the whole sheet is too small for every number. */
const FAR_WIDTH = 2200;

/**
 * A sheet of the drawings with pan and zoom (also with two fingers), opened centred on the
 * first mark. The tiles come from `/api/drawings`, which only answers signed-in users.
 */
export function DrawingViewer({ imageKey, width, height, marks, label }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const library = useRef<OpenSeadragonModule | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fullScreen, setFullScreen] = useState(false);
  const [current, setCurrent] = useState(0);
  const primary = marks.filter(isPrimary);
  const focusable = primary.length > 0 ? primary : marks;
  const aspect = height / width;
  // OpenSeadragon calls back later (when the sheet opens): it must read the latest marks.
  const latest = useRef({ marks, focusable, aspect });
  useEffect(() => {
    latest.current = { marks, focusable, aspect };
  });

  function drawMarks() {
    const OSD = library.current;
    const instance = viewer.current;
    if (!OSD || !instance) return;
    instance.clearOverlays();
    const { aspect } = latest.current;
    for (const mark of latest.current.marks) {
      const frame = markFrame(mark, aspect);
      // The frame belongs to the drawing: it scales with it and always fits what it marks.
      instance.addOverlay({
        element: frameElement(mark),
        location: new OSD.Rect(frame.x, frame.y, frame.width, frame.height),
      });
      if (isHighlighted(mark)) {
        instance.addOverlay({
          element: arrowElement(),
          location: new OSD.Point(frame.x + frame.width / 2, frame.y),
          placement: OSD.Placement.BOTTOM,
          checkResize: false,
        });
      }
      if (mark.label) {
        instance.addOverlay({
          element: labelElement(mark.label, isHighlighted(mark)),
          location: new OSD.Point(frame.x + frame.width, frame.y + frame.height / 2),
          placement: OSD.Placement.LEFT,
          checkResize: false,
        });
      }
    }
  }

  function focus(index: number) {
    const OSD = library.current;
    const mark = latest.current.focusable[index];
    if (!OSD || !viewer.current || !mark) return;
    const x = mark.x;
    const y = mark.y * latest.current.aspect;
    // Unos metros alrededor de la marca: se ve la bandeja y lo que tiene cerca.
    viewer.current.viewport.fitBoundsWithConstraints(new OSD.Rect(x - 0.1, y - 0.065, 0.2, 0.13));
    setCurrent(index);
  }

  useEffect(() => {
    let cancelled = false;
    let instance: Viewer | null = null;
    void import("openseadragon").then((module) => {
      if (cancelled || !container.current) return;
      const OSD = (module.default ?? module) as unknown as OpenSeadragonModule;
      library.current = OSD;
      instance = OSD({
        element: container.current,
        tileSources: `/api/drawings/${imageKey}.dzi`,
        showNavigationControl: false,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
        gestureSettingsTouch: { pinchRotate: false },
        visibilityRatio: 0.3,
        minZoomImageRatio: 0.6,
        maxZoomPixelRatio: 2.5,
        animationTime: 0.6,
      });
      viewer.current = instance;
      // How wide the whole sheet will be on screen (the zoom it is going to) decides whether
      // every number fits.
      const updateDistance = () => {
        const sheetWidth = instance!.viewport.getZoom() * instance!.viewport.getContainerSize().x;
        container.current?.setAttribute("data-far", String(sheetWidth < FAR_WIDTH));
      };
      instance.addHandler("zoom", updateDistance);
      instance.addHandler("open", () => {
        updateDistance();
        drawMarks();
        setStatus("ready");
        focus(0);
      });
      instance.addHandler("open-failed", () => setStatus("error"));
    });
    return () => {
      cancelled = true;
      instance?.destroy();
      viewer.current = null;
    };
    // Solo otra hoja monta otro visor; las marcas se redibujan aparte (efecto de abajo).
  }, [imageKey]);

  // Tras registrar una acción la página se refresca con marcas nuevas sobre la misma hoja
  // (otro color, otra bandeja): se cambian sin volver a cargar el plano.
  const marksKey = JSON.stringify(marks);
  useEffect(() => {
    if (status === "ready") drawMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  useEffect(() => {
    if (!fullScreen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fullScreen]);

  const zoom = (factor: number) => {
    viewer.current?.viewport.zoomBy(factor);
    viewer.current?.viewport.applyConstraints();
  };

  return (
    <div
      className={cn(
        "bg-muted relative overflow-hidden rounded-lg border",
        fullScreen ? "fixed inset-0 z-50 rounded-none border-0" : "h-[28rem] md:h-[34rem]",
      )}
    >
      <div
        ref={container}
        role="img"
        aria-label={label}
        className="group/viewer absolute inset-0 touch-none"
        data-testid="drawing-viewer"
      />
      {status === "loading" ? (
        <p className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Cargando el plano…
        </p>
      ) : null}
      {status === "error" ? (
        <p
          role="alert"
          className="text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
        >
          No se ha podido cargar el plano. Vuelve a intentarlo más tarde.
        </p>
      ) : null}

      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <Button size="icon" variant="secondary" aria-label="Acercar" onClick={() => zoom(1.6)}>
          <PlusIcon />
        </Button>
        <Button size="icon" variant="secondary" aria-label="Alejar" onClick={() => zoom(1 / 1.6)}>
          <MinusIcon />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label="Ver la hoja entera"
          onClick={() => viewer.current?.viewport.goHome()}
        >
          <ScanIcon />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label={fullScreen ? "Salir de pantalla completa" : "Pantalla completa"}
          aria-pressed={fullScreen}
          onClick={() => setFullScreen((value) => !value)}
        >
          {fullScreen ? <Minimize2Icon /> : <Maximize2Icon />}
        </Button>
      </div>

      {focusable.length > 0 ? (
        <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => focus(current)}>
            Ir a la marca
          </Button>
          {focusable.length > 1 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => focus((current + 1) % focusable.length)}
            >
              Siguiente ({current + 1} de {focusable.length})
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
