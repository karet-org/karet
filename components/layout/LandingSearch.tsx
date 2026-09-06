"use client";

// Landing search state shared between the rail input and the grid.

import { createContext, useContext, useState } from "react";
import { IconLookup } from "@/components/icons";

const SearchContext = createContext<{
  query: string;
  setQuery: (q: string) => void;
}>({ query: "", setQuery: () => {} });

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");
  return (
    <SearchContext.Provider value={{ query, setQuery }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}

export function SearchInput() {
  const { query, setQuery } = useSearch();
  return (
    <label className="mb-2 flex items-center gap-2 rounded-lg bg-[color:var(--color-surface-2)] px-2.5 py-[7px] text-[13px] text-[color:var(--color-ink-3)] focus-within:ring-1 focus-within:ring-[color:var(--color-carrot)]">
      <IconLookup size={13} className="shrink-0" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search pipelines…"
        aria-label="Search pipelines"
        className="w-full bg-transparent text-[color:var(--color-ink)] outline-none placeholder:text-[color:var(--color-ink-3)]"
      />
    </label>
  );
}
