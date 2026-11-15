"use client";

import { cn } from "cn";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FIELD_HEIGHT, FIELD_STATES } from "./ui/field-styles";
import { NativeSelect } from "./ui/native-select";

export type SelectOption = { value: string; label: string };

/** The `{ id, label }` lists the server sends, as options. */
export const toOptions = (items: readonly { id: string; label: string }[]): SelectOption[] =>
  items.map((item) => ({ value: item.id, label: item.label }));

/** From this many options the list gets a search box; shorter ones keep the native select. */
export const SEARCH_FROM = 12;

type Props = {
  id: string;
  /** Sent with the form (a hidden input), like a native select. */
  name?: string;
  options: readonly SelectOption[];
  /** Controlled value; leave it out and use `defaultValue` in a plain form. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** First choice, which clears the field ("Todos", "Sin indicar"). */
  emptyLabel?: string;
  /** Shown while nothing is chosen, when there is no `emptyLabel`. */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * "2x2,5" finds "0,6/1 KV 2X2.5 MM2 CU": case, accents, spaces and the decimal comma do not
 * matter when looking for a type, a room or a person.
 */
export const normalizeForSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, "");

/**
 * A select for long lists (cable types, locations, people): it opens a panel with a search
 * box. Lists shorter than `SEARCH_FROM` stay a native select, which on a phone opens the
 * system picker, the easiest with a few options. Same look and states as every field.
 */
export function SearchableSelect(props: Props) {
  if (props.options.length < SEARCH_FROM) return <ShortSelect {...props} />;
  return <LongSelect {...props} />;
}

function ShortSelect({
  id,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  emptyLabel,
  placeholder,
  ...rest
}: Props) {
  return (
    <NativeSelect
      id={id}
      name={name}
      {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? "" })}
      onChange={(event) => onValueChange?.(event.target.value)}
      {...rest}
    >
      {emptyLabel !== undefined ? (
        <option value="">{emptyLabel}</option>
      ) : (
        <option value="" disabled>
          {placeholder ?? "Elige una opción"}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

function LongSelect({
  id,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  emptyLabel,
  placeholder = "Elige una opción",
  required,
  disabled,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: Props) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const selected = value ?? own;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);

  const choices = useMemo(() => {
    const needle = normalizeForSearch(query);
    const matching = needle
      ? options.filter((option) => normalizeForSearch(option.label).includes(needle))
      : options;
    return emptyLabel !== undefined && !needle
      ? [{ value: "", label: emptyLabel }, ...matching]
      : matching;
  }, [options, query, emptyLabel]);

  const current = options.find((option) => option.value === selected);
  const optionId = (index: number) => `${listId}-${index}`;

  function choose(next: string) {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    setOpen(false);
  }

  function openChange(next: boolean) {
    setOpen(next);
    setQuery("");
    // Al abrir, la opción elegida queda resaltada (y a la vista, ver `onOpenAutoFocus`).
    const index = options.findIndex((option) => option.value === selected);
    setActive(index === -1 ? 0 : index + (emptyLabel !== undefined ? 1 : 0));
  }

  function move(to: number) {
    const index = Math.min(Math.max(to, 0), choices.length - 1);
    setActive(index);
    list.current?.children[index]?.scrollIntoView?.({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(choices.length - 1);
    else if (event.key === "Enter" && choices[active]) choose(choices[active].value);
    else return;
    event.preventDefault();
  }

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      {name ? <input type="hidden" name={name} value={selected} /> : null}
      <Popover.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-required={required}
          data-value={selected}
          className={cn(
            FIELD_STATES,
            FIELD_HEIGHT,
            "flex items-center justify-between gap-2 px-2.5 text-left",
          )}
        >
          <span className={cn("truncate", !current && "text-muted-foreground")}>
            {current?.label ?? emptyLabel ?? placeholder}
          </span>
          <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={() => {
            requestAnimationFrame(() =>
              list.current
                ?.querySelector('[aria-selected="true"]')
                ?.scrollIntoView?.({ block: "center" }),
            );
          }}
          className="bg-popover text-popover-foreground z-50 flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),16rem)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-2.5">
            <SearchIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <input
              type="text"
              role="searchbox"
              aria-label="Buscar en la lista"
              aria-controls={listId}
              aria-activedescendant={choices[active] ? optionId(active) : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder="Escribe para buscar…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
                list.current?.scrollTo?.({ top: 0 });
              }}
              onKeyDown={onKeyDown}
              // 16 px en el móvil: así iOS no amplía la página al escribir.
              className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent text-base outline-none md:h-9 md:text-sm"
            />
          </div>
          <ul
            ref={list}
            id={listId}
            role="listbox"
            className="overflow-y-auto overscroll-contain p-1"
          >
            {choices.length === 0 ? (
              <li className="text-muted-foreground px-2.5 py-3 text-center text-sm">
                Nada coincide con «{query.trim()}».
              </li>
            ) : (
              choices.map((option, index) => (
                <li
                  key={option.value || "__empty"}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === selected}
                  data-active={index === active}
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option.value)}
                  className={cn(
                    "flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 text-sm md:min-h-8",
                    index === active && "bg-muted",
                    option.value === "" && "text-muted-foreground",
                  )}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                  {option.value === selected ? (
                    <CheckIcon aria-hidden className="text-primary size-4 shrink-0" />
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
