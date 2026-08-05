import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ReferencePickerOption {
  value: string;
  label: string;
  detail?: string;
  group?: string;
  icon?: ReactNode;
}

export interface ReferencePickerAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export function ReferencePicker({
  id,
  value,
  options,
  actions = [],
  disabled = false,
  ariaLabel,
  placeholder = "Select a reference",
  searchPlaceholder = "Search references...",
  emptyMessage = "No references found.",
  triggerIcon,
  displayValue,
  customValueLabel,
  compact = false,
  className,
  onValueChange
}: {
  id?: string;
  value: string;
  options: readonly ReferencePickerOption[];
  actions?: readonly ReferencePickerAction[];
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  triggerIcon?: ReactNode;
  displayValue?: string;
  customValueLabel?: (query: string) => string;
  compact?: boolean;
  className?: string;
  onValueChange: (value: string) => void;
}): ReactNode {
  const generatedId = useId();
  const listId = `${generatedId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === value) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(() => options.filter((option) => {
    if (!normalizedQuery) return true;
    return `${option.label}\n${option.detail ?? ""}\n${option.group ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
  }), [normalizedQuery, options]);
  const trimmedQuery = query.trim();
  const showCustomValue = Boolean(
    customValueLabel &&
    trimmedQuery &&
    !options.some((option) => option.value.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase())
  );
  const resolvedActiveIndex = Math.min(activeIndex, Math.max(0, filteredOptions.length - 1));

  const close = (): void => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const choose = (option: ReferencePickerOption): void => {
    if (option.value !== value) onValueChange(option.value);
    close();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + delta + filteredOptions.length) % filteredOptions.length);
      return;
    }
    if (event.key === "Enter") {
      const option = filteredOptions[resolvedActiveIndex];
      if (option) {
        event.preventDefault();
        choose(option);
      } else if (showCustomValue) {
        event.preventDefault();
        onValueChange(trimmedQuery);
        close();
      }
    }
  };

  let previousGroup: string | undefined;

  return (
    <Popover open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        setQuery("");
        setActiveIndex(0);
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "sm" : "default"}
          className={cn("reference-picker-trigger", compact && "is-compact", className)}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
        >
          {triggerIcon}
          <span className="reference-picker-trigger-label">{selected?.label ?? displayValue ?? placeholder}</span>
          <ChevronDown className="reference-picker-chevron" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="reference-picker-content"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="reference-picker-search">
          <Search aria-hidden="true" />
          <Input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-expanded={open}
            aria-activedescendant={filteredOptions.length ? `${listId}-${resolvedActiveIndex}` : undefined}
            autoComplete="off"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <div id={listId} className="reference-picker-list" role="listbox" aria-label={ariaLabel}>
          {filteredOptions.length ? filteredOptions.map((option, index) => {
            const showGroup = Boolean(option.group && option.group !== previousGroup);
            previousGroup = option.group;
            const isSelected = option.value === value;
            return (
              <div key={option.value}>
                {showGroup ? <p className="reference-picker-group">{option.group}</p> : null}
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn("reference-picker-option", index === resolvedActiveIndex && "is-active")}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <span className="reference-picker-option-icon">{option.icon}</span>
                  <span className="reference-picker-option-label">{option.label}</span>
                  {option.detail ? <span className="reference-picker-option-detail">{option.detail}</span> : null}
                  {isSelected ? <Check className="reference-picker-option-check" /> : null}
                </button>
              </div>
            );
          }) : !showCustomValue ? <p className="reference-picker-empty">{emptyMessage}</p> : null}
          {showCustomValue ? (
            <button type="button" className={cn("reference-picker-option", filteredOptions.length === 0 && "is-active")} onClick={() => { onValueChange(trimmedQuery); close(); }}>
              <span className="reference-picker-option-label">{customValueLabel?.(trimmedQuery)}</span>
            </button>
          ) : null}
        </div>
        {actions.length ? (
          <div className="reference-picker-actions">
            {actions.map((action) => (
              <button key={action.label} type="button" onClick={() => { close(); action.onSelect(); }}>
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
