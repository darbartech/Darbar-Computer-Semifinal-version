"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SignatoryOption = {
  id: string;
  name: string;
  title: string;
  designation: string;
  signatureUrl: string | null;
  displayOrder: number;
};

export type SelectedSignatory = {
  signatoryId: string | null;
  name: string;
  title: string;
  designation: string;
  displayOrder: number;
};

type Props = {
  options: SignatoryOption[];
  value: SelectedSignatory[];
  onChange: (next: SelectedSignatory[]) => void;
  fieldErrors?: Record<string, string[]>;
  disabled?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{message}</p>;
}

const emptySig = (displayOrder: number): SelectedSignatory => ({
  signatoryId: null,
  name: "",
  title: "",
  designation: "",
  displayOrder,
});

export function SignatorySelector({
  options,
  value,
  onChange,
  fieldErrors,
  disabled,
}: Props) {
  const items = value.length ? value : [emptySig(0)];
  const presetOptions = [
    { value: "", label: "Custom entry" },
    ...options.map((option) => ({
      value: option.id,
      label: `${option.name} — ${option.title}`,
    })),
  ];

  const add = () => {
    onChange([...items, emptySig(items.length)]);
  };

  const remove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next.map((item, i) => ({ ...item, displayOrder: i })));
  };

  const update = (index: number, patch: Partial<SelectedSignatory>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };

  const selectPreset = (index: number, id: string) => {
    const preset = options.find((option) => option.id === id);
    if (!preset) {
      update(index, { signatoryId: null, name: "", title: "", designation: "" });
      return;
    }
    update(index, {
      signatoryId: preset.id,
      name: preset.name,
      title: preset.title,
      designation: preset.designation,
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next.map((item, i) => ({ ...item, displayOrder: i })));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium text-neutral-800">Signatories</Label>
          <p className="mt-0.5 text-xs text-neutral-500">
            Minimum 1, maximum 5. Order is top to bottom on the certificate.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={add}
          disabled={disabled || items.length >= 5}
        >
          <Plus className="size-4" />
          Add signatory
        </Button>
      </div>
      <FieldError message={fieldErrors?.issuedSignatories?.[0]} />

      <div className="flex flex-col gap-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "mt-7 flex flex-col items-center gap-1",
                  disabled && "opacity-40"
                )}
              >
                <button
                  type="button"
                  aria-label="Move signatory up"
                  title="Move up"
                  onClick={() => move(index, -1)}
                  disabled={disabled || index === 0}
                  className="flex size-6 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move signatory down"
                  title="Move down"
                  onClick={() => move(index, 1)}
                  disabled={disabled || index === items.length - 1}
                  className="flex size-6 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>

              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label
                    htmlFor={`sig-preset-${index}`}
                    className="mb-1 block text-xs font-semibold text-neutral-600"
                  >
                    Pick a saved signatory (optional)
                  </Label>
                  <Select
                    id={`sig-preset-${index}`}
                    value={item.signatoryId ?? ""}
                    onChange={(event) => selectPreset(index, event.target.value)}
                    disabled={disabled}
                    options={presetOptions}
                  />
                </div>

                <div>
                  <Label
                    htmlFor={`sig-name-${index}`}
                    className="mb-1 block text-xs font-semibold text-neutral-600"
                  >
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`sig-name-${index}`}
                    value={item.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div>
                  <Label
                    htmlFor={`sig-title-${index}`}
                    className="mb-1 block text-xs font-semibold text-neutral-600"
                  >
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`sig-title-${index}`}
                    value={item.title}
                    onChange={(event) => update(index, { title: event.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label
                    htmlFor={`sig-desig-${index}`}
                    className="mb-1 block text-xs font-semibold text-neutral-600"
                  >
                    Designation <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`sig-desig-${index}`}
                    value={item.designation}
                    onChange={(event) => update(index, { designation: event.target.value })}
                    disabled={disabled}
                  />
                </div>
              </div>

              {items.length > 1 && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(index)}
                  className="mt-7 shrink-0 text-destructive/70 hover:text-destructive"
                  aria-label="Remove signatory"
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}