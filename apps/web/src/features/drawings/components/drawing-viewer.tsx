"use client";

import { cn } from "cn";
import { Maximize2Icon, Minimize2Icon, MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type OpenSeadragon from "openseadragon";
import type { Viewer } from "openseadragon";
import { isCableSheetKey, type DrawingMark } from "@cables/shared";
import { BrandLoader } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { TONE_BORDER } from "@/features/cables/status-tones";

/** A point to highlight on the sheet. `emphasis` ones get the arrow and the zoom. */
export type ViewerMark = DrawingMark & {
  /** Short text next to the mark ("1", "Aquí"): route steps are numbered. */
  label?: string;
  /**
   * `target` (default): what is being looked for, with the arrow. On a route, the state of each
   * tray: `laid`, `pending` (not laid yet or no data) and `loose` (where the loose end waits).
   */
  tone?: "target" | "laid" | "pending" | "loose";
};

type Props = {
  imageKey: string;
  /** Size of the sheet in points: gives its proportions. */
  width: number;
  height: number;
  marks: ViewerMark[];
  /** Accessible name of the drawing ("Plano EJ-ELE-DRW-0024, hoja 03"). */
  label: string;
  /** What is shown, for the texts: a drawing ("plano") or the page of a list ("hoja"). */
  noun?: "plano" | "hoja";
  /**
   * The same sheet with the red marks of quality (fase 19), when there is one: a switch above
   * the viewer shows it instead of the sheet, with the same marks.
   */
  redMarksKey?: string | null;
};

const LAYER =
  "flex flex-1 items-center justify-center rounded-md px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-3";

type OpenSeadragonModule = typeof OpenSeadragon;

/** Marks the eye should go to: the drawn code or the section flag, not the table rows. */
const isPrimary = (mark: ViewerMark) => mark.kind !== "table";

// Los colores de los estados, los mismos que en las etiquetas y en el recorrido.
const TONE_FRAME: Record<NonNullable<ViewerMark["tone"]>, string> = {
  target: TONE_BORDER.partial,
  loose: TONE_BORDER.partial,
  laid: TONE_BORDER.laid,
  pending: TONE_BORDER.pending,
};

/** The arrow and the pulse go only to what is being looked for (on a route, where it is). */
const isHighlighted = (mark: ViewerMark) =>
  mark.kind !== "table" &&
  (mark.tone === undefined || mark.tone === "target" || mark.tone === "loose");

/** Without a stored size (older data), a small square around the point. */
const DEFAULT_SIZE = { w: 0.012, h: 0.008 };

/**
 * Where a mark sits on the image, in OpenSeadragon's coordinates (the width is 1, the height
 * follows the sheet): a frame around the text with a margin, so it fits whatever it marks
 * and grows and shrinks with the drawing.
 */
export function markFrame(mark: ViewerMark, aspect: number) {
  // Todo en las unidades del visor: el ancho de la hoja es 1 y el alto, `aspect`.
  const width = mark.w ?? DEFAULT_SIZE.w;
  const height = (mark.h ?? DEFAULT_SIZE.h) * aspect;
  // El margen sale del grosor de la línea de texto, sea horizontal o vertical. Con el alto
  // (que en un código vertical es su largo) el recuadro se comía las columnas de al lado.
  const line = Math.min(width, height);
  // Margin of a third of a line around it; the flags' boxes are a bit larger than their number.
  const pad = line * (mark.kind === "flag" ? 0.7 : 0.35);
  return {
    x: mark.x - width / 2 - pad,
    y: mark.y * aspect - height / 2 - pad,
    width: width + pad * 2,
    height: height + pad * 2,
  };
}

/** Built by hand: OpenSeadragon owns the DOM of its overlays. */
function frameElement(mark: ViewerMark): HTMLElement {
  const element = document.createElement("div");
  element.dataset.mark = mark.kind;
  element.dataset.tone = mark.tone ?? "target";
  element.className = cn(
    // Solo el borde, de un color: lo que hay debajo se sigue leyendo.
    "pointer-events-none rounded-sm",
    TONE_FRAME[mark.tone ?? "target"],
    isHighlighted(mark) ? "border-4" : "border-[3px]",
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
      <path class="stroke-background" fill="currentColor" stroke-width="0.6" d="M12 22 4 12h5V2h6v10h5z"/>
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
    "pointer-events-none mt-1 rounded-full bg-background px-1.5 text-xs font-bold text-foreground shadow",
    !keep && "group-data-[far=true]/viewer:invisible",
  );
  element.textContent = label;
  return element;
}

/** Keys of OpenSeadragon that are not used here: rotate and flip the sheet. */
const NO_KEYS = new Set(["KeyR", "KeyF"]);
const KEY_ZOOM = 1.25;

/** Below this width on screen (pixels) the whole sheet is too small for every number. */
const FAR_WIDTH = 2200;

/**
 * A sheet of the drawings, or the original page of a cable, with pan and zoom (also with two
 * fingers), opened centred on the first mark. The images come from `/api/drawings`, which only
 * answers signed-in users.
 */
export function DrawingViewer({ redMarksKey, ...props }: Props) {
  const [layer, setLayer] = useState<"sheet" | "redmarks">("sheet");
  if (!redMarksKey) return <SheetViewer {...props} />;
  const layers = [
    { id: "sheet", label: "Plano" },
    { id: "redmarks", label: "Con red marks" },
  ] as const;
  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Versión del plano"
        className="bg-muted/60 flex gap-1 rounded-lg border p-0.5 md:max-w-sm"
      >
        {layers.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={layer === item.id}
            onClick={() => setLayer(item.id)}
            className={
              layer === item.id
                ? `${LAYER} bg-primary text-primary-foreground font-semibold shadow-sm`
                : `${LAYER} text-foreground hover:bg-muted font-medium`
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      <SheetViewer
        key={layer}
        {...props}
        imageKey={layer === "redmarks" ? redMarksKey : props.imageKey}
        label={layer === "redmarks" ? `${props.label}, con red marks` : props.label}
      />
    </div>
  );
}

function SheetViewer({
  imageKey,
  width,
  height,
  marks,
  label,
  noun = "plano",
}: Omit<Props, "redMarksKey">) {
  const frame = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const library = useRef<OpenSeadragonModule | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [fullScreen, setFullScreen] = useState(false);
  const [current, setCurrent] = useState(0);
  const hintId = useId();
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
          // Debajo del recuadro, fuera de él: a un lado taparía el código vecino (en los planos
          // con códigos verticales pegados, la columna de al lado).
          location: new OSD.Point(frame.x + frame.width / 2, frame.y + frame.height),
          placement: OSD.Placement.TOP,
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
        // The page of a cable is one image; a drawing sheet, Deep Zoom tiles.
        tileSources: isCableSheetKey(imageKey)
          ? { type: "image", url: `/api/drawings/${imageKey}.webp` }
          : `/api/drawings/${imageKey}.dzi`,
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
      // Teclado (con el plano seleccionado): flechas o WASD, + y −, 0. Girar (R) y voltear (F)
      // dejarían las marcas donde no toca y sin un botón para deshacerlo.
      instance.addHandler("canvas-key", (event) => {
        const { code, key } = event.originalEvent as KeyboardEvent;
        if (NO_KEYS.has(code)) {
          event.preventDefaultAction = true;
          return;
        }
        // OpenSeadragon solo acerca y aleja con las teclas `=` y `-` de un teclado inglés: en
        // uno español el «+» está en otra tecla.
        const factor = key === "+" ? KEY_ZOOM : key === "-" ? 1 / KEY_ZOOM : null;
        if (factor && code !== "Equal" && code !== "Minus") {
          event.preventDefaultAction = true;
          instance!.viewport.zoomBy(factor);
          instance!.viewport.applyConstraints();
        }
      });
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

  // Pantalla completa del navegador cuando la hay (oculta también sus barras). Si no (iPhone),
  // el visor ocupa la ventana y la página de detrás no se desplaza.
  const [native, setNative] = useState(false);
  useEffect(() => {
    const sync = () => {
      const active = document.fullscreenElement === frame.current;
      setNative(active);
      if (!active) setFullScreen((value) => (value && document.fullscreenEnabled ? false : value));
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!fullScreen || native) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [fullScreen, native]);

  async function toggleFullScreen() {
    if (fullScreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFullScreen(false);
      return;
    }
    setFullScreen(true);
    if (frame.current?.requestFullscreen && document.fullscreenEnabled) {
      // Si el navegador la rechaza, se queda la de la ventana.
      await frame.current.requestFullscreen().catch(() => {});
    }
  }

  const zoom = (factor: number) => {
    viewer.current?.viewport.zoomBy(factor);
    viewer.current?.viewport.applyConstraints();
  };

  return (
    <div
      ref={frame}
      className={cn(
        "bg-muted relative overflow-hidden rounded-lg border",
        fullScreen ? "fixed inset-0 z-50 rounded-none border-0" : "h-[28rem] md:h-[34rem]",
      )}
    >
      {/* Se mueve con el ratón, los dedos y el teclado: es una aplicación, no una imagen. */}
      <div
        ref={container}
        role="application"
        aria-roledescription={noun}
        aria-label={label}
        aria-describedby={hintId}
        className="group/viewer has-[:focus-visible]:ring-ring/50 absolute inset-0 touch-none has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-inset [&_:focus-visible]:outline-none"
        data-testid="drawing-viewer"
      />
      <p id={hintId} className="sr-only">
        Con {noun === "hoja" ? "la hoja seleccionada" : "el plano seleccionado"}: flechas para
        moverlo, + y − para acercar o alejar, y 0 para verlo entero.
      </p>
      {status === "loading" ? (
        <BrandLoader
          label={`Cargando ${noun === "hoja" ? "la hoja" : "el plano"}…`}
          className="absolute inset-0 justify-center"
        />
      ) : null}
      {status === "error" ? (
        <p
          role="alert"
          className="text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center text-sm"
        >
          No se ha podido cargar {noun === "hoja" ? "la hoja" : "el plano"}. Vuelve a intentarlo más
          tarde.
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
          onClick={() => void toggleFullScreen()}
        >
          {fullScreen ? <Minimize2Icon /> : <Maximize2Icon />}
        </Button>
      </div>

      {fullScreen ? (
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-2 left-2"
          onClick={() => void toggleFullScreen()}
        >
          <Minimize2Icon aria-hidden /> Salir de pantalla completa
        </Button>
      ) : null}

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
