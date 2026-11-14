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

const TONE_RING: Record<NonNullable<ViewerMark["tone"]>, string> = {
  primary: "border-warning",
  warning: "border-warning",
  success: "border-success",
  muted: "border-muted-foreground",
};

/** The HTML laid over the drawing at a mark. Built by hand: OpenSeadragon owns that DOM. */
function markElement(mark: ViewerMark): HTMLElement {
  const tone = mark.tone ?? "primary";
  const element = document.createElement("div");
  element.className = "pointer-events-none relative flex size-14 items-center justify-center";
  element.dataset.mark = mark.kind;
  if (mark.kind === "table") {
    // The overlay is laid over the whole code (see `drawMarks`): a frame that grows with zoom.
    element.className = `pointer-events-none rounded-sm border-2 ${TONE_RING[tone]} bg-warning/10`;
    return element;
  }
  // Solo lo que se busca lleva flecha y pulso: en un recorrido, la bandeja donde está el cable.
  const highlighted = tone === "primary" || tone === "warning";
  element.innerHTML = highlighted
    ? `
    <span class="absolute inset-0 rounded-full border-4 ${TONE_RING[tone]}"></span>
    <svg class="absolute -top-14 left-1/2 size-12 -translate-x-1/2 drop-shadow text-warning" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" stroke="black" stroke-width="0.6" d="M12 22 4 12h5V2h6v10h5z"/>
    </svg>`
    : `<span class="absolute inset-1 rounded-full border-4 ${TONE_RING[tone]}"></span>`;
  if (mark.label) {
    const badge = document.createElement("span");
    badge.className =
      "absolute -right-3 -bottom-3 rounded-full bg-background px-1.5 text-xs font-bold text-foreground";
    badge.textContent = mark.label;
    element.append(badge);
  }
  return element;
}

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
      if (mark.kind === "table" && mark.w && mark.h) {
        // A table row: a frame around the code, a little larger than the text.
        const w = mark.w * 1.15;
        const h = mark.h * 1.4;
        instance.addOverlay({
          element: markElement(mark),
          location: new OSD.Rect(mark.x - w / 2, (mark.y - h / 2) * aspect, w, h * aspect),
        });
        continue;
      }
      instance.addOverlay({
        element: markElement(mark),
        location: new OSD.Point(mark.x, mark.y * aspect),
        placement: OSD.Placement.CENTER,
        checkResize: false,
      });
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
      instance.addHandler("open", () => {
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
        className="absolute inset-0 touch-none"
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
