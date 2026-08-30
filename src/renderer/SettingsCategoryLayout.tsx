import type { ComponentType, ReactNode, SVGProps } from "react";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface SettingsCategoryDefinition<T extends string> {
  id: T;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
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
    className="settings-category-layout grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 md:grid-cols-[240px_minmax(0,1fr)] md:grid-rows-1"
  >
    <div className="settings-category-nav border-b p-3 md:border-r md:border-b-0 md:p-4">
      <Label htmlFor="settings-category" className="sr-only">Settings category</Label>
      <select
        id="settings-category"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm md:hidden"
        value={activeCategory}
        disabled={disabled}
        onChange={(event) => onCategoryChange(event.target.value as T)}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.label}</option>
        ))}
      </select>
      <TabsList aria-label="Settings categories" className="hidden h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0 md:flex">
        {categories.map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            aria-label={label}
            className="group h-auto w-full justify-start gap-3 px-3 py-2 text-left data-[state=active]:bg-accent data-[state=active]:shadow-none"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground group-data-[state=active]:text-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-medium">
                {label}
                {dirtyCategories[id] ? <span className="size-1.5 rounded-full bg-primary" aria-label="Unsaved changes" /> : null}
                {errorCategories[id] ? <span className="size-2 rounded-full bg-destructive" aria-label="Error" /> : null}
              </span>
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
    <div className="settings-category-panels min-h-0 overflow-hidden">{children}</div>
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
  return <TabsContent value={value} className="m-0 h-full min-h-0 overflow-y-auto">
    <section className="grid gap-5 px-5 py-5 sm:px-6">
      <div><h2 className="text-base font-semibold">{title}</h2>{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}</div>
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
  return <section className="grid gap-4 rounded-lg border bg-card p-4">
    <div><h3 className="text-sm font-semibold">{title}</h3>{description ? <p className="text-sm text-muted-foreground">{description}</p> : null}</div>
    {children}
  </section>;
}
