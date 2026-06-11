import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

/**
 * A combobox over real entities: a text input backed by a <datalist> of entity
 * ids (optionally filtered by type). You can pick a known entity or type any id.
 */
export default function EntityPicker({
  type,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const options = useQuery(api.entities.listEntities, type ? { type } : {});
  const listId = `entopts-${type ?? "all"}`;
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "entity id"}
        className={`rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-line ${className}`}
      />
      <datalist id={listId}>
        {(options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name ? `${o.name} — ${o.id}` : o.id}
          </option>
        ))}
      </datalist>
    </>
  );
}
