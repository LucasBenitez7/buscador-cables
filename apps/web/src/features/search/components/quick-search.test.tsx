import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickSearchResults } from "@/server/search/quick";
import { QuickSearch, destinationOf } from "./quick-search";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

// Datos inventados.
const empty: QuickSearchResults = {
  cables: [],
  cablesTotal: 0,
  cablesFuzzy: false,
  trays: [],
  traysTotal: 0,
  equipment: [],
  locations: [],
  exact: null,
};
const found: QuickSearchResults = {
  ...empty,
  cables: [
    {
      id: "c1",
      code: "SH-50",
      description: "Bomba de prueba",
      installationStatus: "LAID",
      connectionStatus: "DISCONNECTED",
    },
  ],
  cablesTotal: 12,
  trays: [{ code: "99UXA00L22036", kind: "LADDER", building: "Edificio Norte" }],
  traysTotal: 1,
  equipment: [{ equipment: "99BMA", cables: 3 }],
};

describe("destinationOf", () => {
  it("goes straight to the record when the text is exactly one code", () => {
    expect(destinationOf("sh-50", { ...found, exact: "/cables/c1" })).toBe("/cables/c1");
  });

  it("goes to the list of the first kind that has something", () => {
    expect(destinationOf("sh", found)).toBe("/cables?q=sh");
    expect(destinationOf("99ux", { ...empty, trays: found.trays, traysTotal: 1 })).toBe(
      "/trays?q=99ux",
    );
    expect(destinationOf("99bm", { ...empty, equipment: found.equipment })).toBe(
      "/equipment?q=99bm",
    );
    expect(destinationOf("nada", empty)).toBe("/cables?q=nada");
    expect(destinationOf("sh 50", null)).toBe("/cables?q=sh%2050");
  });
});

describe("QuickSearch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    mocks.push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const respond = (results: QuickSearchResults) =>
    fetchMock.mockResolvedValue({ ok: true, json: async () => results });

  async function type(text: string) {
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar" }), {
      target: { value: text },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  }

  it("asks once the user pauses, and shows a few of each kind with links", async () => {
    respond(found);
    render(<QuickSearch />);

    await type("s");
    expect(fetchMock).not.toHaveBeenCalled();

    await type("sh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/search?q=sh");

    const cables = screen.getByRole("region", { name: "Cables (12)" });
    expect(within(cables).getByRole("link", { name: "SH-50" })).toHaveAttribute(
      "href",
      "/cables/c1",
    );
    expect(within(cables).getByRole("link", { name: "Ver los 12 cables" })).toHaveAttribute(
      "href",
      "/cables?q=sh",
    );
    expect(
      within(screen.getByRole("region", { name: "Bandejas (1)" })).getByRole("link", {
        name: "99UXA00L22036",
      }),
    ).toHaveAttribute("href", "/trays/99UXA00L22036");
    expect(
      within(screen.getByRole("region", { name: "Equipos (1)" })).getByRole("link", {
        name: "99BMA",
      }),
    ).toHaveAttribute("href", "/equipment/99BMA");
  });

  it("says so when nothing matches", async () => {
    respond(empty);
    render(<QuickSearch />);

    await type("zzz");

    expect(screen.getByText(/Nada coincide con «zzz»/)).toBeInTheDocument();
  });

  it("opens the record of an exact code with Enter", async () => {
    respond({ ...found, exact: "/cables/c1" });
    render(<QuickSearch />);

    await type("SH-50");
    await act(async () => {
      fireEvent.submit(screen.getByRole("search", { name: "Buscar" }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.push).toHaveBeenCalledWith("/cables/c1");
  });
});
