import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChipRow, chipScrollOffset } from "./chip-row";

const row = { left: 0, right: 300 };

describe("chipScrollOffset", () => {
  it("does not move a chip that is fully shown", () => {
    expect(chipScrollOffset({ left: 40, right: 120 }, row)).toBe(0);
  });

  it("brings a half-hidden chip in, with some space to spare", () => {
    expect(chipScrollOffset({ left: 250, right: 340 }, row)).toBe(56);
    expect(chipScrollOffset({ left: -30, right: 50 }, row)).toBe(-46);
  });
});

describe("ChipRow", () => {
  it("scrolls sideways when a half-hidden chip is touched", () => {
    render(
      <ChipRow aria-label="Catálogos">
        <button type="button">Empresas</button>
      </ChipRow>,
    );
    const group = screen.getByLabelText("Catálogos");
    Object.defineProperty(group, "scrollWidth", { value: 500 });
    Object.defineProperty(group, "clientWidth", { value: 300 });
    const scrollBy = vi.fn();
    group.scrollBy = scrollBy;
    group.getBoundingClientRect = () => ({ left: 0, right: 300 }) as DOMRect;
    const chip = screen.getByRole("button", { name: "Empresas" });
    chip.getBoundingClientRect = () => ({ left: 260, right: 360 }) as DOMRect;

    fireEvent.click(chip);

    expect(scrollBy).toHaveBeenCalledWith({ left: 76, behavior: "smooth" });
  });

  it("does nothing when every chip fits", () => {
    render(
      <ChipRow aria-label="Hojas">
        <button type="button">Hoja 1</button>
      </ChipRow>,
    );
    const group = screen.getByLabelText("Hojas");
    const scrollBy = vi.fn();
    group.scrollBy = scrollBy;

    fireEvent.click(screen.getByRole("button", { name: "Hoja 1" }));

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
