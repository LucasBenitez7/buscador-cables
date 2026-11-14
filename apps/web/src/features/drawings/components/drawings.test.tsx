import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TraySheet } from "@/server/trays/service";
import { DrawingViewer } from "./drawing-viewer";
import { TrayDrawings, sheetHint } from "./tray-drawings";

// OpenSeadragon dibuja en un canvas que jsdom no tiene: se sustituye por un doble que guarda
// las marcas y deja abrir la hoja a mano.
const osd = vi.hoisted(() => {
  const state = {
    options: null as null | { tileSources: string },
    overlays: [] as { element: HTMLElement; location: { x: number; y: number } }[],
    handlers: {} as Record<string, () => void>,
    fitted: [] as { x: number; y: number }[],
  };
  class Point {
    constructor(
      public x: number,
      public y: number,
    ) {}
  }
  class Rect {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }
  const factory = Object.assign(
    (options: { tileSources: string }) => {
      state.options = options;
      return {
        addHandler: (name: string, handler: () => void) => {
          state.handlers[name] = handler;
        },
        addOverlay: (overlay: (typeof state.overlays)[number]) => state.overlays.push(overlay),
        clearOverlays: () => {
          state.overlays = [];
        },
        destroy: () => {},
        viewport: {
          fitBoundsWithConstraints: (rect: Rect) => state.fitted.push({ x: rect.x, y: rect.y }),
          zoomBy: () => {},
          applyConstraints: () => {},
          goHome: () => {},
        },
      };
    },
    { Point, Rect, Placement: { CENTER: "center" } },
  );
  return { state, factory };
});

vi.mock("openseadragon", () => ({ default: osd.factory }));

beforeEach(() => {
  osd.state.options = null;
  osd.state.overlays = [];
  osd.state.handlers = {};
  osd.state.fitted = [];
});

describe("DrawingViewer", () => {
  it("loads the sheet tiles from the private API and marks every point", async () => {
    render(
      <DrawingViewer
        imageKey="EJ-ELE-DRW-0024_02"
        width={2000}
        height={1000}
        marks={[
          { x: 0.5, y: 0.4, kind: "flag" },
          { x: 0.1, y: 0.1, kind: "table" },
        ]}
        label="Plano EJ-ELE-DRW-0024, hoja 02"
      />,
    );
    expect(screen.getByRole("img", { name: "Plano EJ-ELE-DRW-0024, hoja 02" })).toBeInTheDocument();
    await waitFor(() => expect(osd.state.options).not.toBeNull());
    expect(osd.state.options!.tileSources).toBe("/api/drawings/EJ-ELE-DRW-0024_02.dzi");

    osd.state.handlers.open!();

    await waitFor(() => expect(screen.queryByText("Cargando el plano…")).toBeNull());
    expect(osd.state.overlays.map((overlay) => overlay.element.dataset.mark)).toEqual([
      "flag",
      "table",
    ]);
    // Coordenadas de OpenSeadragon: el alto va en proporción al ancho (1000 / 2000).
    expect(osd.state.overlays[0]!.location).toEqual({ x: 0.5, y: 0.2 });
    // Se abre centrado en la bandera, no en la fila de la tabla.
    expect(osd.state.fitted[0]!.x).toBeCloseTo(0.4);
  });

  it("goes from one mark to the next and says when the sheet cannot be loaded", async () => {
    render(
      <DrawingViewer
        imageKey="EJ_02"
        width={1000}
        height={1000}
        marks={[
          { x: 0.2, y: 0.2, kind: "label" },
          { x: 0.6, y: 0.6, kind: "label" },
        ]}
        label="Plano"
      />,
    );
    await waitFor(() => expect(osd.state.handlers.open).toBeDefined());
    osd.state.handlers.open!();

    fireEvent.click(await screen.findByRole("button", { name: "Siguiente (1 de 2)" }));
    expect(osd.state.fitted.at(-1)!.x).toBeCloseTo(0.5);
    expect(screen.getByRole("button", { name: "Siguiente (2 de 2)" })).toBeInTheDocument();

    osd.state.handlers["open-failed"]!();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha podido cargar el plano");
  });
});

describe("TrayDrawings", () => {
  const sheet = (overrides: Partial<TraySheet>): TraySheet => ({
    drawing: "EJ-ELE-DRW-0024",
    sheet: "02",
    title: null,
    sourcePage: 1,
    marks: [],
    image: { key: "EJ-ELE-DRW-0024_02", width: 2384, height: 1684 },
    ...overrides,
  });

  it("describes what each sheet shows of the tray", () => {
    expect(sheetHint("99UXA00L21014", [{ x: 0, y: 0, kind: "label" }])).toBe(
      "Bandeja marcada en el plano",
    );
    expect(sheetHint("99UXA00L21014", [{ x: 0, y: 0, kind: "flag" }])).toBe(
      "Bandera de la sección 014",
    );
    expect(sheetHint("99UXA00L21014", [{ x: 0, y: 0, kind: "table" }])).toBe(
      "Solo en la tabla de la sección 014",
    );
  });

  it("opens the first sheet with an image and lets the user switch", async () => {
    render(
      <TrayDrawings
        code="99UXA00L21014"
        sheets={[
          sheet({ sheet: "03", image: null, marks: [{ x: 0.5, y: 0.5, kind: "flag" }] }),
          sheet({ sheet: "04", title: "TABLAS", marks: [{ x: 0.2, y: 0.2, kind: "table" }] }),
        ]}
      />,
    );

    const list = screen.getByRole("list", { name: "Hojas donde aparece" });
    expect(within(list).getAllByRole("button")[0]).toHaveTextContent("sin imagen");
    expect(within(list).getAllByRole("button")[1]).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(osd.state.options?.tileSources).toContain("EJ-ELE-DRW-0024_02"));

    fireEvent.click(within(list).getAllByRole("button")[0]!);
    expect(
      screen.getByText("La imagen de este plano todavía no está disponible."),
    ).toBeInTheDocument();
  });
});
