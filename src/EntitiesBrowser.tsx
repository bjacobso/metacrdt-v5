import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type Filter = { attribute: string; op: string; value: string };
type Sort = { attribute: string; dir: "asc" | "desc" };

const OPS = ["=", "!=", ">", "<", ">=", "<="];

function cell(vals: unknown[] | undefined): string {
  if (!vals || vals.length === 0) return "";
  return vals.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
}

export default function EntitiesBrowser() {
  const types = useQuery(api.entities.listEntityTypes, {});
  const [type, setType] = useState<string | null>(null);

  // Draft (editing) vs applied (what the query runs).
  const [draftFilters, setDraftFilters] = useState<Filter[]>([]);
  const [draftSort, setDraftSort] = useState<Sort | null>(null);
  const [applied, setApplied] = useState<{ filters: Filter[]; sort?: Sort }>({
    filters: [],
  });

  // Cursor pagination.
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [stack, setStack] = useState<(string | undefined)[]>([]);

  const attrs = useQuery(api.entities.typeAttributes, type ? { type } : "skip");
  const result = useQuery(
    api.entities.queryEntities,
    type
      ? {
          type,
          filters: applied.filters,
          sort: applied.sort,
          cursor,
          pageSize: 10,
        }
      : "skip",
  );

  // Default the first type once types load.
  useEffect(() => {
    if (type === null && types && types.length > 0) selectType(types[0].type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  function selectType(t: string) {
    setType(t);
    setDraftFilters([]);
    setDraftSort(null);
    setApplied({ filters: [] });
    setCursor(undefined);
    setStack([]);
  }

  function apply() {
    setApplied({
      filters: draftFilters.filter((f) => f.attribute && f.value !== ""),
      sort: draftSort ?? undefined,
    });
    setCursor(undefined);
    setStack([]);
  }

  function next() {
    if (!result?.continueCursor) return;
    setStack((s) => [...s, cursor]);
    setCursor(result.continueCursor);
  }
  function prev() {
    setStack((s) => {
      if (s.length === 0) return s;
      setCursor(s[s.length - 1]);
      return s.slice(0, -1);
    });
  }

  const columns = attrs ?? [];

  return (
    <div className="browser">
      <aside className="types">
        <h3>Entity types</h3>
        {types === undefined ? (
          <p className="hint">Loading…</p>
        ) : types.length === 0 ? (
          <p className="hint">No entities with a <code>type</code> attribute yet.</p>
        ) : (
          <ul>
            {types.map((t) => (
              <li key={t.type}>
                <button
                  className={t.type === type ? "type active" : "type"}
                  onClick={() => selectType(t.type)}
                >
                  {t.type} <span className="count">{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="content">
        {type === null ? (
          <p className="hint">Pick a type.</p>
        ) : (
          <>
            <section className="panel">
              <h2>{type} — query builder</h2>
              {draftFilters.map((f, i) => (
                <div className="row filter" key={i}>
                  <select
                    value={f.attribute}
                    onChange={(e) =>
                      setDraftFilters((fs) =>
                        fs.map((x, j) => (j === i ? { ...x, attribute: e.target.value } : x)),
                      )
                    }
                  >
                    <option value="">attribute…</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={f.op}
                    onChange={(e) =>
                      setDraftFilters((fs) =>
                        fs.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)),
                      )
                    }
                  >
                    {OPS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <input
                    value={f.value}
                    placeholder="value (JSON or text)"
                    onChange={(e) =>
                      setDraftFilters((fs) =>
                        fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      )
                    }
                  />
                  <button onClick={() => setDraftFilters((fs) => fs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="row">
                <button
                  onClick={() =>
                    setDraftFilters((fs) => [...fs, { attribute: "", op: "=", value: "" }])
                  }
                >
                  + Filter
                </button>
                <select
                  value={draftSort?.attribute ?? ""}
                  onChange={(e) =>
                    setDraftSort(
                      e.target.value
                        ? { attribute: e.target.value, dir: draftSort?.dir ?? "asc" }
                        : null,
                    )
                  }
                >
                  <option value="">sort by…</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={draftSort?.dir ?? "asc"}
                  disabled={!draftSort}
                  onChange={(e) =>
                    setDraftSort((s) => (s ? { ...s, dir: e.target.value as "asc" | "desc" } : s))
                  }
                >
                  <option value="asc">asc</option>
                  <option value="desc">desc</option>
                </select>
                <button onClick={apply}>Apply</button>
              </div>
            </section>

            <section className="panel">
              <div className="tableHead">
                <h2>Rows</h2>
                <span className="hint">
                  {result ? `${result.total} match${result.total === 1 ? "" : "es"}` : "…"}
                </span>
              </div>
              {result === undefined ? (
                <p className="hint">Loading…</p>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>id</th>
                        {columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.page.map((row) => (
                        <tr key={row.id}>
                          <td className="attr">{row.id}</td>
                          {columns.map((c) => (
                            <td key={c}>{cell(row.attributes[c])}</td>
                          ))}
                        </tr>
                      ))}
                      {result.page.length === 0 && (
                        <tr>
                          <td colSpan={columns.length + 1} className="hint">
                            No matching rows.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="row pager">
                <button onClick={prev} disabled={stack.length === 0}>
                  ← Prev
                </button>
                <button onClick={next} disabled={!result || result.isDone}>
                  Next →
                </button>
              </div>
            </section>

            <section className="panel">
              <h2>Compiled Datalog</h2>
              <pre className="result">
                {result ? JSON.stringify(result.compiled, null, 2) : "…"}
              </pre>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
