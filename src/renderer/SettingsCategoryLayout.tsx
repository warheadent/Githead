import type { ComponentType, FormEvent, ReactNode, SVGProps } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MotionSwap } from "./motion";

export interface SettingsCategoryDefinition<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface SettingsDialogStatus {
  key: string;
  content: ReactNode;
}

/** The shared Settings and Repository settings frame: header, category body, status line and Cancel/Save. */
export function SettingsDialogFrame({
  open,
  busy,
  eyebrow,
  title,
  description,
  status,
  saving,
  saveDisabled,
  cancelsOperation = false,
  cancelDisabled = false,
  onRequestClose,
  onSubmit,
  children
}: {
  open: boolean;
  busy: boolean;
  eyebrow: string;
  title: string;
  description: ReactNode;
  status: SettingsDialogStatus;
  saving: boolean;
  saveDisabled: boolean;
  /** While true, Cancel stops the running operation and is labelled as such. */
  cancelsOperation?: boolean;
  cancelDisabled?: boolean;
  onRequestClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}): ReactNode {
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onRequestClose(); }}>
    <DialogContent
      className="settings-dialog h-[min(780px,calc(100vh-2rem))] max-h-[min(780px,calc(100vh-2rem))] overflow-clip p-0 sm:max-w-[880px]"
      aria-busy={busy}
    >
      <form className="settings-dialog-form grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" onSubmit={onSubmit}>
        <DialogHeader className="settings-dialog-header border-b px-6 py-5 pr-14">
          <p className="eyebrow">{eyebrow}</p>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="grid gap-1">{description}</DialogDescription>
        </DialogHeader>

        {children}

        <div className="settings-dialog-footer flex min-h-16 flex-col gap-3 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <MotionSwap
            item={status}
            className="relative min-h-5 min-w-0 text-sm"
            presenceClassName=""
            initialY={-2}
          />
          <DialogFooter className="settings-dialog-actions shrink-0">
            <Button type="button" variant="outline" disabled={cancelDisabled} onClick={onRequestClose}>{cancelsOperation ? "Cancel operation" : "Cancel"}</Button>
            <Button type="submit" disabled={saveDisabled}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function SettingsCategoryLayout<T extends string>({
  activeCategory,
  categories,
  disabled,
  dirtyCategories = {},
  errorCategories = {},
  onCategoryChange,
  children
}: {
  activeCategory: T;
  categories: readonly SettingsCategoryDefinition<T>[];
  disabled: boolean;
  dirtyCategories?: Partial<Record<T, boolean>>;
  errorCategories?: Partial<Record<T, boolean>>;
  onCategoryChange: (category: T) => void;
  children: ReactNode;
}): ReactNode {
  return <Tabs
    value={activeCategory}
    orientation="vertical"
    onValueChange={(value) => onCategoryChange(value as T)}
    className="settings-category-layout grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 md:grid-cols-[200px_minmax(0,1fr)] md:grid-rows-1"
  >
    <div className="settings-category-nav border-b bg-background p-2 md:border-r md:border-b-0">
      <Label htmlFor="settings-category" className="sr-only">Settings category</Label>
      <select
        id="settings-category"
        className="form-select md:hidden"
        value={activeCategory}
        disabled={disabled}
        onChange={(event) => onCategoryChange(event.target.value as T)}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.label}</option>
        ))}
      </select>
      <TabsList aria-label="Settings categories" className="hidden h-auto w-full flex-col items-stretch gap-0.5 bg-transparent p-0 md:flex">
        {categories.map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            aria-label={label}
            className="group h-8 w-full flex-none justify-start gap-2 rounded-md px-2.5 text-left font-normal text-foreground hover:bg-hover data-[state=active]:bg-selected data-[state=active]:font-medium data-[state=active]:shadow-none"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground group-data-[state=active]:text-foreground" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{label}</span>
              {dirtyCategories[id] ? <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes" /> : null}
              {errorCategories[id] ? <span className="size-2 shrink-0 rounded-full bg-destructive" aria-label="Error" /> : null}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
    <div className="settings-category-panels min-h-0 overflow-hidden bg-surface">{children}</div>
  </Tabs>;
}

export function SettingsPanel<T extends string>({
  value,
  title,
  description,
  children
}: {
  value: T;
  title: string;
  description?: string;
  children: ReactNode;
}): ReactNode {
  return <TabsContent value={value} className="settings-panel m-0 h-full min-h-0 overflow-y-auto">
    <section className="grid gap-6 px-6 py-6">
      <div><h2 className="text-title">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
      {children}
    </section>
  </TabsContent>;
}

export function SettingsCard({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}): ReactNode {
  return <section className="settings-card grid gap-4">
    <div className="settings-card-heading"><h3 className="text-heading">{title}</h3>{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}</div>
    {children}
  </section>;
}
