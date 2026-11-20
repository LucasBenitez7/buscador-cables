"use client";

import { cn } from "cn";
import Link from "next/link";
import {
  ChevronRightIcon,
  MoreHorizontalIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  LOCATION_TYPE_LABELS,
  childLocationType,
  listMoveTargets,
  type LocationNode,
  type LocationType,
} from "@cables/shared";
import { SelectCheckbox } from "@/components/selection";
import { locationLabel } from "@/lib/location-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteLocationAction } from "@/features/locations/actions";
import type { ActionResult } from "@/lib/action-result";
import type { LocationWithCounts } from "@/server/locations/service";
import { LocationForm } from "./location-form";
import { LocationMoveForm } from "./location-move-form";

type Node = LocationNode<LocationWithCounts>;

/** Which inline form is open: adding under a node ("root" = new plant), editing or moving one. */
type OpenForm =
  | { kind: "add"; parentId: string | "root" }
  | { kind: "edit"; id: string }
  | { kind: "move"; id: string }
  | null;

/** Plural of a child's type, for "· 3 áreas" on a folded node. */
const PLURAL: Record<LocationType, string> = {
  PLANT: "plantas",
  AREA: "áreas",
  UNIT: "unidades",
  SITE: "sitios",
};

type Props = {
  /** The locations to show: already filtered and ordered. */
  tree: Node[];
  /**
   * The whole tree, for where a location can move. A search must not hide destinations, so the
   * page passes the unfiltered tree here.
   */
  allTree?: Node[];
  canManage: boolean;
  /** Ids that match the search; they are highlighted while `searching`. */
  matches?: readonly string[];
  searching?: boolean;
};

/**
 * Open at first: the plants (so their areas show), or, with a search, every location that
 * holds a match (the filtered tree has only those). `searching` true opens all of them.
 */
function initialExpanded(tree: readonly Node[], searching: boolean): Set<string> {
  const ids = new Set<string>();
  const walk = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (searching ? node.children.length > 0 : node.type === "PLANT") ids.add(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

export function LocationTree({
  tree,
  allTree = tree,
  canManage,
  matches = [],
  searching = false,
}: Props) {
  const [form, setForm] = useState<OpenForm>(null);
  const [expanded, setExpanded] = useState(() => initialExpanded(tree, searching));
  const close = useCallback(() => setForm(null), []);
  const matched = useMemo(() => new Set(matches), [matches]);
  const toggle = useCallback(
    (id: string) =>
      setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const expand = useCallback(
    (id: string) =>
      setExpanded((previous) => (previous.has(id) ? previous : new Set(previous).add(id))),
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canManage ? (
          form?.kind === "add" && form.parentId === "root" ? (
            <LocationForm mode="create" type="PLANT" parentId={null} onDone={close} />
          ) : (
            <Button size="sm" onClick={() => setForm({ kind: "add", parentId: "root" })}>
              <PlusIcon aria-hidden />
              Nueva planta
            </Button>
          )
        ) : null}
        {tree.length > 0 ? (
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(initialExpanded(tree, true))}
            >
              Expandir todo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
              Contraer todo
            </Button>
          </div>
        ) : null}
      </div>

      {tree.length === 0 ? (
        searching ? (
          <p role="status" className="text-muted-foreground text-sm">
            Ninguna ubicación cumple la búsqueda.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Todavía no hay ubicaciones.</p>
        )
      ) : (
        <ul className="space-y-1" aria-label="Árbol de ubicaciones">
          {tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              tree={allTree}
              canManage={canManage}
              expanded={expanded}
              onToggle={toggle}
              onExpand={expand}
              matched={matched}
              searching={searching}
              form={form}
              setForm={setForm}
              close={close}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type ItemProps = {
  node: Node;
  /** Whole tree, to list where a node can be moved. */
  tree: Node[];
  canManage: boolean;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  matched: ReadonlySet<string>;
  searching: boolean;
  form: OpenForm;
  setForm: (form: OpenForm) => void;
  close: () => void;
  /** Inside another location: draws the guide line that links it to its parent. */
  nested?: boolean;
};

function TreeItem({
  node,
  tree,
  canManage,
  expanded,
  onToggle,
  onExpand,
  matched,
  searching,
  form,
  setForm,
  close,
  nested = false,
}: ItemProps) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const childType = childLocationType(node.type);
  const isOpen = expanded.has(node.id);
  const hit = searching && matched.has(node.id);
  const editing = form?.kind === "edit" && form.id === node.id;
  const adding = form?.kind === "add" && form.parentId === node.id;
  const moving = form?.kind === "move" && form.id === node.id;

  function remove() {
    if (!window.confirm(`¿Eliminar "${node.name}"? No se puede deshacer.`)) {
      return;
    }
    const formData = new FormData();
    formData.set("id", node.id);
    startTransition(async () => {
      setMessage(await deleteLocationAction(formData));
    });
  }

  function addChild() {
    onExpand(node.id);
    setForm({ kind: "add", parentId: node.id });
  }

  const childCount = node.children.length;

  return (
    <li
      className={cn(
        "relative",
        nested &&
          "before:border-border before:absolute before:top-4 before:-left-4 before:w-3 before:border-t before:content-['']",
      )}
    >
      {editing ? (
        <LocationForm mode="edit" location={node} onDone={close} />
      ) : moving ? (
        <LocationMoveForm location={node} targets={listMoveTargets(tree, node)} onDone={close} />
      ) : (
        <div
          className={cn(
            "group hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5",
            hit && "bg-primary/10",
          )}
        >
          {childCount > 0 ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Contraer" : "Expandir"} ${node.name}`}
              className="text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/70 focus-visible:ring-ring/50 -m-1.5 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-3 md:size-6"
            >
              <ChevronRightIcon
                aria-hidden
                className={cn("size-4 transition-transform", isOpen && "rotate-90")}
              />
            </button>
          ) : (
            <span className="w-5 md:w-3" aria-hidden />
          )}
          <SelectCheckbox item={{ key: node.id, label: locationLabel(node) }} />
          <Badge variant="outline">{LOCATION_TYPE_LABELS[node.type]}</Badge>
          <Link
            href={`/locations/${encodeURIComponent(node.id)}`}
            className={cn(
              "hover:text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 transition-colors outline-none hover:underline focus-visible:ring-3",
              hit && "text-primary",
            )}
          >
            {node.name}
          </Link>
          <code className="bg-muted rounded px-1.5 font-mono text-xs">{node.code}</code>
          {/* Plegada: cuánto contiene, junto a su nombre (a la derecha quedaba suelto). */}
          {!isOpen && childType && childCount > 0 ? (
            <span className="text-muted-foreground text-xs">
              {childCount}{" "}
              {childCount === 1 ? LOCATION_TYPE_LABELS[childType].toLowerCase() : PLURAL[childType]}
            </span>
          ) : null}

          <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            {node.cableCount > 0 ? (
              // Abre el buscador con los cables de aquí y de todo lo que contiene.
              <Link
                href={`/cables?location=${encodeURIComponent(node.id)}`}
                className="text-primary hover:text-primary/80 focus-visible:ring-ring/50 rounded-sm text-xs font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
              >
                {node.cableCount} {node.cableCount === 1 ? "cable" : "cables"} →
              </Link>
            ) : null}
            {canManage ? (
              <>
                {/* Con ratón y pantalla ancha: los botones aparecen al pasar o enfocar la fila.
                    En una pantalla táctil (también tablets) no hay «pasar»: va el menú. */}
                <span className="hidden items-center gap-1 md:pointer-fine:flex md:pointer-fine:opacity-0 md:pointer-fine:transition-opacity md:pointer-fine:group-focus-within:opacity-100 md:pointer-fine:group-hover:opacity-100">
                  {childType ? (
                    <Button size="xs" variant="ghost" onClick={addChild}>
                      <PlusIcon aria-hidden />
                      Añadir {LOCATION_TYPE_LABELS[childType].toLowerCase()}
                    </Button>
                  ) : null}
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setForm({ kind: "edit", id: node.id })}
                  >
                    <PencilIcon aria-hidden />
                    Editar
                  </Button>
                  {node.type !== "PLANT" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setForm({ kind: "move", id: node.id })}
                      aria-label={`Mover ${node.name}`}
                    >
                      <MoveIcon aria-hidden />
                      Mover
                    </Button>
                  ) : null}
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/15 hover:text-destructive dark:hover:bg-destructive/15"
                    onClick={remove}
                    disabled={pending}
                  >
                    <Trash2Icon aria-hidden />
                    Eliminar
                  </Button>
                </span>

                {/* Móvil y pantallas táctiles: las mismas acciones en un menú. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="md:pointer-fine:hidden"
                      aria-label={`Acciones de ${node.name}`}
                    >
                      <MoreHorizontalIcon aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {childType ? (
                      <DropdownMenuItem onSelect={addChild}>
                        <PlusIcon aria-hidden />
                        Añadir {LOCATION_TYPE_LABELS[childType].toLowerCase()}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setForm({ kind: "edit", id: node.id })}>
                      <PencilIcon aria-hidden />
                      Editar
                    </DropdownMenuItem>
                    {node.type !== "PLANT" ? (
                      <DropdownMenuItem onSelect={() => setForm({ kind: "move", id: node.id })}>
                        <MoveIcon aria-hidden />
                        Mover
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      className="text-destructive"
                      disabled={pending}
                      onSelect={remove}
                    >
                      <Trash2Icon aria-hidden />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </span>
        </div>
      )}

      {message && !message.ok ? (
        <p role="alert" className="text-destructive ml-9 text-xs">
          {message.message}
        </p>
      ) : null}

      {isOpen && (childCount > 0 || adding) ? (
        <ul className="border-border ml-3 space-y-1 border-l pl-4">
          {adding && childType ? (
            <li className="before:border-border relative before:absolute before:top-4 before:-left-4 before:w-3 before:border-t before:content-['']">
              <LocationForm mode="create" type={childType} parentId={node.id} onDone={close} />
            </li>
          ) : null}
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              tree={tree}
              canManage={canManage}
              expanded={expanded}
              onToggle={onToggle}
              onExpand={onExpand}
              matched={matched}
              searching={searching}
              form={form}
              setForm={setForm}
              close={close}
              nested
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
