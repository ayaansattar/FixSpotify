"use client";

import { useEffect, useRef, useState } from "react";

export type DropdownOption = {
  value: string;
  label: string;
};

type DropdownProps = {
  options: readonly DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function Dropdown({ options, value, onChange, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      listRef.current
        ?.querySelector('[data-highlighted="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlighted]);

  function openMenu() {
    setHighlighted(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  }

  function choose(option: DropdownOption) {
    setOpen(false);

    if (option.value !== value) {
      onChange(option.value);
    }
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(options[highlighted]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/15 bg-[#111713] px-4 py-3 text-left text-white transition-colors hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        type="button"
      >
        <span className="truncate">{selected?.label ?? "Select…"}</span>
        <svg
          aria-hidden
          className={`h-4 w-4 shrink-0 text-[#a7b0aa] transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#151b17] p-1.5 shadow-xl shadow-black/50"
          ref={listRef}
          role="listbox"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlighted;

            return (
              <li key={option.value}>
                <button
                  aria-selected={isSelected}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    isHighlighted ? "bg-white/10" : ""
                  } ${isSelected ? "text-[#1ed760]" : "text-white"}`}
                  data-highlighted={isHighlighted}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setHighlighted(index)}
                  role="option"
                  type="button"
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <svg
                      aria-hidden
                      className="h-4 w-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="m5 13 4 4L19 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
