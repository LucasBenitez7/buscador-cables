import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SelectAllRow,
  SelectCheckbox,
  SelectionAside,
  SelectionProvider,
  type SelectAllResult,
  type SelectionItem,
} from "./selection";

const items: SelectionItem[] = [
  { key: "1", label: "99XAT10W2001" },
  { key: "2", label: "99XAT10W2002" },
  { key: "3", label: "99XAT10W2003" },
];

function List({
  title = "Cables",
  shown = items,
  total,
  selectAll,
  resetKey,
}: {
  title?: string;
  shown?: SelectionItem[];
  total?: number;
  selectAll?: () => Promise<SelectAllResult>;
  resetKey?: string;
}) {
  return (
    <SelectionProvider
      title={title}
      items={shown}
      total={total}
      selectAll={selectAll}
      resetKey={resetKey}
    >
      <SelectionAside />
      <SelectAllRow />
      <ul>
        {shown.map((item) => (
          <li key={item.key}>
            <SelectCheckbox item={item} />
            {item.label}
          </li>
        ))}
      </ul>
    </SelectionProvider>
  );
}

const start = (index = 0) =>
  fireEvent.click(screen.getAllByRole("button", { name: "Seleccionar" })[index]!);
const status = () => screen.getByRole("status").textContent;

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SelectionProvider", () => {
  it("shows no ticks until «Seleccionar» is pressed, and leaves them with «Cancelar»", () => {
    render(<List />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    start();
    expect(screen.getByRole("checkbox", { name: "Elegir 99XAT10W2001" })).toBeTruthy();
    expect(status()).toBe("Ninguno elegido");
    expect(screen.queryByRole("button", { name: "Seleccionar" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("chooses rows one by one and every row with one tick", () => {
    render(<List />);
    start();

    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir 99XAT10W2002" }));
    expect(status()).toBe("1 elegido");
    const all = screen.getByRole("checkbox", { name: "Seleccionar todas" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    expect(screen.getByText("Seleccionar todas (3)")).toBeTruthy();

    fireEvent.click(all);
    expect(status()).toBe("3 elegidos");
    expect(all.checked).toBe(true);
    fireEvent.click(all);
    expect(status()).toBe("Ninguno elegido");
  });

  it("with pages, one tick brings everything that matches the filters from the server", async () => {
    const selectAll = vi.fn<() => Promise<SelectAllResult>>().mockResolvedValue({
      ok: true,
      items: [...items, { key: "4", label: "99XAT10W2004" }],
    });
    render(<List shown={items.slice(0, 2)} total={4} selectAll={selectAll} />);
    start();

    // Una sola casilla: no hay «las de esta página».
    expect(screen.queryByText(/de esta página/)).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Seleccionar todas las que cumplen los filtros" }),
    );

    await waitFor(() => expect(status()).toBe("4 elegidos"));
    expect(selectAll).toHaveBeenCalledOnce();
  });

  it("says why it could not choose everything", async () => {
    const selectAll = vi
      .fn<() => Promise<SelectAllResult>>()
      .mockResolvedValue({ ok: false, message: "Son más de 5000: afina los filtros." });
    render(<List shown={items.slice(0, 1)} total={6000} selectAll={selectAll} />);
    start();
    fireEvent.click(screen.getByRole("checkbox", { name: /que cumplen los filtros/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Son más de 5000: afina los filtros.",
    );
    expect(status()).toBe("Ninguno elegido");
  });

  it("keeps the choice when the page changes and empties it when the filters do", () => {
    const { rerender } = render(<List resetKey="?q=99" />);
    start();
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir 99XAT10W2001" }));

    // Otra página con los mismos filtros: lo elegido sigue.
    rerender(<List shown={[{ key: "9", label: "99XAT10W2009" }]} total={4} resetKey="?q=99" />);
    expect(status()).toBe("1 elegido");

    rerender(<List resetKey="?q=98" />);
    expect(status()).toBe("Ninguno elegido");
  });

  it("copies the chosen codes, one per line, and says «Copiado» for a moment", async () => {
    vi.useFakeTimers();
    render(<List />);
    start();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    });
    expect(writeText).toHaveBeenCalledWith("99XAT10W2001\n99XAT10W2002\n99XAT10W2003");
    expect(screen.getByRole("button", { name: "Copiado" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copiar" })).toBeTruthy();
  });

  it("says so when the codes cannot be copied", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<List />);
    start();
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir 99XAT10W2001" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "No se pudo copiar. Inténtalo de nuevo.",
    );
  });

  it("prints a clean sheet with the title, the date and only the chosen codes", () => {
    let sheet: HTMLElement | null = null;
    let printing = false;
    vi.spyOn(window, "print").mockImplementation(() => {
      sheet = document.querySelector<HTMLElement>("[data-print-sheet]");
      printing = document.documentElement.classList.contains("printing-selection");
    });
    render(<List title="Bandeja 99UXA00L22036" />);
    start();
    expect(screen.getByRole("button", { name: "Imprimir" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir 99XAT10W2003" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Elegir 99XAT10W2001" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));

    expect(printing).toBe(true);
    expect(sheet!.querySelector("h1")?.textContent).toBe("Bandeja 99UXA00L22036");
    expect(sheet!.querySelector("p")?.textContent).toContain(
      new Date().toLocaleDateString("es-ES"),
    );
    expect([...sheet!.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "99XAT10W2003",
      "99XAT10W2001",
    ]);

    // Al cerrar el diálogo, la hoja se quita.
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.querySelector("[data-print-sheet]")).toBeNull();
    expect(document.documentElement.classList.contains("printing-selection")).toBe(false);
  });

  it("lets only one list of the page choose at a time", () => {
    render(
      <>
        <List title="Esperando aquí" />
        <List title="Pasan por aquí" />
      </>,
    );
    start(0);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Elegir 99XAT10W2001" })[0]!);
    start(0); // El de la segunda lista: el de la primera ya no está.

    expect(screen.getAllByRole("region", { name: "Elegidos" })).toHaveLength(1);
    expect(status()).toBe("Ninguno elegido");
  });
});
