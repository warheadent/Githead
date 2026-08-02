import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GitIdentityScope } from "../shared/types";

export interface GitIdentityFieldsProps {
  idPrefix: string;
  name: string;
  email: string;
  scope: GitIdentityScope;
  disabled: boolean;
  error?: string;
  autoFocusName?: boolean;
  onChange: (patch: Partial<{ name: string; email: string; scope: GitIdentityScope }>) => void;
}

export function GitIdentityFields({
  idPrefix,
  name,
  email,
  scope,
  disabled,
  error = "",
  autoFocusName = false,
  onChange
}: GitIdentityFieldsProps): ReactNode {
  const hasError = Boolean(error);
  const errorId = `${idPrefix}-error`;

  return (
    <fieldset className="grid max-w-xl gap-4" disabled={disabled}>
      <legend className="sr-only">Git Identity</legend>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          type="text"
          autoComplete="name"
          value={name}
          autoFocus={autoFocusName}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input
          id={`${idPrefix}-email`}
          type="email"
          autoComplete="email"
          value={email}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(event) => onChange({ email: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Save identity to</p>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Save Git identity to">
          {(["repository", "global"] as const).map((item) => (
            <Label key={item} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
              <input
                type="radio"
                name={`${idPrefix}-scope`}
                value={item}
                checked={scope === item}
                onChange={() => onChange({ scope: item })}
                className="size-4"
              />
              {item === "repository" ? "This repository" : "Global"}
            </Label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
