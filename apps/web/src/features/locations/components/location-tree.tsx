"use client";

import { cn } from "cn";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
import {
  LOCATION_TYPE_LABELS,
  childLocationType,
  listMoveTargets,
  type LocationNode,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
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

export function LocationTree({ tree, canManage }: { tree: Node[]; canManage: boolean }) {
  const [open, setOpen] = useState<OpenForm>(null);
  const close = useCallback(() => setOpen(null), []);

  return (
    <div className="space-y-4">
      {canManage ? (
        open?.kind === "add" && open.parentId === "root" ? (
          <LocationForm mode="create" type="PLANT" parentId={null} onDone={close} />
        ) : (
          <Button size="sm" onClick={() => setOpen({ kind: "add", parentId: "root" })}>
            Nueva planta
          </Button>
        )
      ) : null}

      {tree.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay ubicaciones.</p>
      ) : (
        <ul className="space-y-1" aria-label="Árbol de ubicaciones">
          {tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              tree={tree}
              canManage={canManage}
              open={open}
              setOpen={setOpen}
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
  open: OpenForm;
  setOpen: (form: OpenForm) => void;
  close: () => void;
};

function TreeItem({ node, tree, canManage, open, setOpen, close }: ItemProps) {
  const [expanded, setExpanded] = useState(node.type === "PLANT" || node.type === "AREA");
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const childType = childLocationType(node.type);
  const editing = open?.kind === "edit" && open.id === node.id;
  const adding = open?.kind === "add" && open.parentId === node.id;
  const moving = open?.kind === "move" && open.id === node.id;

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

  return (
    <li>
      {editing ? (
        <LocationForm mode="edit" location={node} onDone={close} />
      ) : moving ? (
        <LocationMoveForm location={node} targets={listMoveTargets(tree, node)} onDone={close} />
      ) : (
        <div className="hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5">
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Contraer" : "Expandir"} ${node.name}`}
              className="text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/70 focus-visible:ring-ring/50 -m-1.5 grid size-8 place-items-center rounded-md outline-none focus-visible:ring-3 md:size-6"
            >
              <ChevronRightIcon
                aria-hidden
                className={cn("size-4 transition-transform", expanded && "rotate-90")}
              />
            </button>
          ) : (
            <span className="w-5 md:w-3" aria-hidden />
          )}
          <span className="font-medium">{node.name}</span>
          <code className="bg-muted rounded px-1.5 text-xs">{node.code}</code>
          <span className="text-muted-foreground text-xs">{LOCATION_TYPE_LABELS[node.type]}</span>
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
            <span className="ml-auto flex gap-1">
              {childType ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setExpanded(true);
                    setOpen({ kind: "add", parentId: node.id });
                  }}
                >
                  Añadir {LOCATION_TYPE_LABELS[childType].toLowerCase()}
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setOpen({ kind: "edit", id: node.id })}
              >
                Editar
              </Button>
              {node.type !== "PLANT" ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setOpen({ kind: "move", id: node.id })}
                  aria-label={`Mover ${node.name}`}
                >
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
                Eliminar
              </Button>
            </span>
          ) : null}
        </div>
      )}

      {message && !message.ok ? (
        <p role="alert" className="text-destructive ml-9 text-xs">
          {message.message}
        </p>
      ) : null}

      {expanded && (node.children.length > 0 || adding) ? (
        <ul className="ml-4 space-y-1 border-l pl-3">
          {adding && childType ? (
            <li>
              <LocationForm mode="create" type={childType} parentId={node.id} onDone={close} />
            </li>
          ) : null}
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              tree={tree}
              canManage={canManage}
              open={open}
              setOpen={setOpen}
              close={close}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
