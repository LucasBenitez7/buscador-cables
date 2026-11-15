import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SEARCH_FROM, SearchableSelect, normalizeForSearch } from "./searchable-select";

const types = [
  "(N)HXH 12 x 1,5 mm2",
  "0,6/1 KV 2X2.5 MM2 CU",
  "0,6/1 KV 2X2,5MM2 CU",
  "0,6/1 KV 4X16MM2 CU",
  "Fibra óptica 12 F",
  ...Array.from({ length: 10 }, (_, index) => `Control ${index + 1} x 1,5`),
].map((label, index) => ({ value: `t${index}`, label }));

function renderLong(props: Partial<Parameters<typeof SearchableSelect>[0]> = {}) {
  return render(
    <form aria-label="Filtros">
      <label htmlFor="type">Tipo</label>
      <SearchableSelect id="type" name="type" options={types} emptyLabel="Todos" {...props} />
    </form>,
  );
}

const formValue = () =>
  Object.fromEntries(new FormData(screen.getByRole<HTMLFormElement>("form", { name: "Filtros" })));

describe("normalizeForSearch", () => {
  it("ignores case, accents, spaces and the decimal comma", () => {
    expect(normalizeForSearch("0,6/1 KV 2X2.5 MM2")).toBe(normalizeForSearch("0.6/1 kv 2x2,5mm2"));
    expect(normalizeForSearch("Fibra Óptica")).toBe("fibraoptica");
  });
});

describe("SearchableSelect", () => {
  it("keeps the native select for short lists", () => {
    render(
      <SearchableSelect
        id="level"
        name="level"
        options={types.slice(0, SEARCH_FROM - 1)}
        emptyLabel="Todos"
      />,
    );

    expect(screen.getByRole("combobox").tagName).toBe("SELECT");
  });

  it("filters a long list as you type and sends the choice with the form", () => {
    renderLong();
    const trigger = screen.getByRole("combobox", { name: "Tipo" });
    expect(trigger).toHaveTextContent("Todos");

    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en la lista" }), {
      target: { value: "2x2,5" },
    });

    const listbox = screen.getByRole("listbox");
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["0,6/1 KV 2X2.5 MM2 CU", "0,6/1 KV 2X2,5MM2 CU"]);
    fireEvent.click(within(listbox).getByRole("option", { name: "0,6/1 KV 2X2,5MM2 CU" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveTextContent("0,6/1 KV 2X2,5MM2 CU");
    expect(formValue()).toEqual({ type: "t2" });
  });

  it("works with the keyboard and says when nothing matches", () => {
    renderLong({ defaultValue: "t1" });
    fireEvent.click(screen.getByRole("combobox", { name: "Tipo" }));
    const search = screen.getByRole("searchbox");

    // La elegida empieza resaltada (después de "Todos").
    expect(screen.getByRole("option", { name: "0,6/1 KV 2X2.5 MM2 CU" })).toHaveAttribute(
      "data-active",
      "true",
    );
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(formValue()).toEqual({ type: "t2" });

    fireEvent.click(screen.getByRole("combobox", { name: "Tipo" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("Nada coincide con «zzz».")).toBeInTheDocument();
  });

  it("clears back to the empty choice and works controlled", () => {
    const onValueChange = vi.fn();
    render(
      <SearchableSelect
        id="origin"
        options={types}
        value="t3"
        onValueChange={onValueChange}
        emptyLabel="Sin indicar"
      />,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Sin indicar" }));

    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
