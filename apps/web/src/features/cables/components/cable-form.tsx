"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import {
  CONNECTION_STATUSES,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUSES,
  INSTALLATION_STATUS_LABELS,
  createCableSchema,
  formatDecimal,
  normalizeCableCode,
  updateCableSchema,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCableAction,
  updateCableAction,
  type CableFormResult,
} from "@/features/cables/actions";
import { issuesByField } from "@/lib/action-result";
import type { CableForEdit, CableFormOptions, Option } from "@/server/cables/service";

type Props =
  | { mode: "create"; options: CableFormOptions }
  | { mode: "edit"; options: CableFormOptions; cable: CableForEdit };

type Values = Record<string, string>;

const DECIMAL_FIELDS = new Set(["crossSectionMm2", "outerDiameterMm", "lengthM"]);

function initialValues(props: Props): Values {
  if (props.mode === "create") {
    return { installationStatus: "IN_STOCK", connectionStatus: "DISCONNECTED" };
  }
  const values: Values = {};
  for (const [key, value] of Object.entries(props.cable)) {
    values[key] =
      value === null
        ? ""
        : typeof value === "number" && DECIMAL_FIELDS.has(key)
          ? formatDecimal(value)
          : String(value);
  }
  return values;
}

/**
 * Alta y edición de un cable. Valida con el mismo esquema Zod que el servidor
 * antes de enviar y muestra los errores junto a cada campo. Los estados solo se
 * eligen en el alta: después cambian con las acciones (tender, conectar…).
 */
export function CableForm(props: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => initialValues(props));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CableFormResult | null>(null);
  const [pending, startTransition] = useTransition();
  const creating = props.mode === "create";
  const { options } = props;

  const value = (name: string) => values[name] ?? "";
  const set = (name: string, next: string) =>
    setValues((current) => ({ ...current, [name]: next }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Values = creating
      ? values
      : { ...values, id: props.cable.id, version: String(props.cable.version) };

    const parsed = (creating ? createCableSchema : updateCableSchema).safeParse(payload);
    if (!parsed.success) {
      setErrors(issuesByField(parsed.error));
      setResult({ ok: false, message: "Revisa los campos marcados." });
      return;
    }

    const formData = new FormData();
    for (const [key, text] of Object.entries(payload)) {
      formData.set(key, text);
    }
    startTransition(async () => {
      const outcome = await (creating ? createCableAction : updateCableAction)(formData);
      setResult(outcome);
      setErrors(outcome.ok ? {} : (outcome.fieldErrors ?? {}));
      if (!outcome.ok) {
        return;
      }
      if (creating) {
        router.push(`/cables/${outcome.id}/edit?created=1`);
      } else if (outcome.changed) {
        // Recarga la página con la nueva versión del cable. El formulario se vuelve a
        // montar (pierde su estado), así que el aviso lo muestra la página.
        router.replace(`/cables/${outcome.id}/edit?saved=1`);
      }
    });
  }

  const field = (name: string) => ({
    id: name,
    name,
    value: value(name),
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  const normalizedCode = value("code").trim() ? normalizeCableCode(value("code")) : "";

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <Section title="Identificación">
        <Field name="code" label="Código" error={errors.code}>
          <Input
            {...field("code")}
            onChange={(event) => set("code", event.target.value)}
            autoComplete="off"
            className="font-mono uppercase"
            required
          />
          {normalizedCode && normalizedCode !== value("code") ? (
            <p className="text-muted-foreground text-xs">Se guardará como {normalizedCode}</p>
          ) : null}
        </Field>
        <Field name="description" label="Descripción" error={errors.description} wide>
          <Input
            {...field("description")}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
        <SelectField
          name="typeId"
          label="Tipo"
          options={options.cableTypes}
          field={field}
          set={set}
          error={errors.typeId}
        />
        <SelectField
          name="colorId"
          label="Color"
          options={options.colors}
          field={field}
          set={set}
          error={errors.colorId}
        />
        <SelectField
          name="manufacturerId"
          label="Fabricante"
          options={options.manufacturers}
          field={field}
          set={set}
          error={errors.manufacturerId}
        />
      </Section>

      <Section title="Características">
        {(
          [
            ["conductors", "Nº de conductores", "numeric"],
            ["crossSectionMm2", "Sección (mm²)", "decimal"],
            ["outerDiameterMm", "Diámetro exterior (mm)", "decimal"],
            ["lengthM", "Longitud (m)", "decimal"],
          ] as const
        ).map(([name, label, inputMode]) => (
          <Field key={name} name={name} label={label} error={errors[name]}>
            <Input
              {...field(name)}
              inputMode={inputMode}
              onChange={(event) => set(name, event.target.value)}
            />
          </Field>
        ))}
        <Field name="voltageRating" label="Tensión nominal" error={errors.voltageRating}>
          <Input
            {...field("voltageRating")}
            placeholder="0,6/1 kV"
            onChange={(event) => set("voltageRating", event.target.value)}
          />
        </Field>
      </Section>

      <Section title="Recorrido">
        <SelectField
          name="originId"
          label="Origen"
          options={options.locations}
          field={field}
          set={set}
          error={errors.originId}
          wide
        />
        <SelectField
          name="destinationId"
          label="Destino"
          options={options.locations}
          field={field}
          set={set}
          error={errors.destinationId}
          wide
        />
      </Section>

      {creating ? (
        <Section title="Estado inicial">
          <Field name="installationStatus" label="Instalación" error={errors.installationStatus}>
            <NativeSelect
              {...field("installationStatus")}
              onChange={(event) => set("installationStatus", event.target.value)}
            >
              {INSTALLATION_STATUSES.filter((status) => status !== "RETIRED").map((status) => (
                <option key={status} value={status}>
                  {INSTALLATION_STATUS_LABELS[status]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field name="connectionStatus" label="Conexión" error={errors.connectionStatus}>
            <NativeSelect
              {...field("connectionStatus")}
              onChange={(event) => set("connectionStatus", event.target.value)}
            >
              {CONNECTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CONNECTION_STATUS_LABELS[status]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {value("installationStatus") !== "LAID" ? (
            <SelectField
              name="currentLocationId"
              label="Dónde está ahora"
              options={options.locations}
              field={field}
              set={set}
              error={errors.currentLocationId}
              wide
            />
          ) : null}
        </Section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Estado: {INSTALLATION_STATUS_LABELS[props.cable.installationStatus]} ·{" "}
          {CONNECTION_STATUS_LABELS[props.cable.connectionStatus]}. Los cambios de estado se
          registran con las acciones del cable (tender, conectar, mover…).
        </p>
      )}

      <Section title="Notas">
        <Field name="notes" label="Notas" error={errors.notes} wide>
          <textarea
            {...field("notes")}
            onChange={(event) => set("notes", event.target.value)}
            rows={3}
            className="border-input bg-background w-full rounded-lg border px-2.5 py-1.5 text-sm"
          />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : creating ? "Dar de alta" : "Guardar cambios"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/cables">Volver a cables</Link>
        </Button>
        {result ? (
          <p
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "text-sm" : "text-destructive text-sm"}
          >
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <legend className="mb-3 text-base font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  name,
  label,
  error,
  wide,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NativeSelect(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className="border-input bg-background aria-invalid:border-destructive h-8 w-full rounded-lg border px-2.5 text-sm"
    />
  );
}

function SelectField({
  name,
  label,
  options,
  field,
  set,
  error,
  wide,
}: {
  name: string;
  label: string;
  options: Option[];
  field: (name: string) => React.ComponentProps<"select">;
  set: (name: string, value: string) => void;
  error?: string;
  wide?: boolean;
}) {
  return (
    <Field name={name} label={label} error={error} wide={wide}>
      <NativeSelect {...field(name)} onChange={(event) => set(name, event.target.value)}>
        <option value="">Sin indicar</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
