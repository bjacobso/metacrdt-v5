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
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
