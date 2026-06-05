import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import EntityDetail from "./EntityDetail";

function shortId(s: string): string {
  return s.includes(":") ? s.split(":")[1] : s;
}

/**
 * The "your data" view: configured/ad-hoc entity types in the sidebar (system
 * meta-types tucked behind a disclosure), each a list of instances that open
 * the entity detail page. This is what a user of the product actually works in.
 */
export default function Data() {
  const types = useQuery(api.entities.listEntityTypes, {});
  const [type, setType] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const setupStaffing = useMutation(api.appconfig.setupStaffing);
  const [busy, setBusy] = useState(false);

  const entities = useQuery(
    api.entities.listEntities,
    type ? { type, origin: "all" } : "skip",
  );

  const userTypes = (types ?? []).filter((t) => t.origin !== "system");
  const systemTypes = (types ?? []).filter((t) => t.origin === "system");

  // Default-select the first non-system type with data.
  useEffect(() => {
    if (type === null && userTypes.length > 0) {
      const first = userTypes.find((t) => t.count > 0) ?? userTypes[0];
      setType(first.type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  function pick(t: string) {
    setType(t);
    setSelected(null);
  }

  async function bootstrap() {
    setBusy(true);
    try {
      await setupStaffing({});
    } finally {
      setBusy(false);
    }
  }

  const empty = types && types.length === 0;

  return (
    <div className="browser">
      <aside className="types">
        <h3>Your data</h3>
        {types === undefined ? (
          <p className="hint">Loading…</p>
        ) : userTypes.length === 0 ? (
          <p className="hint">No entity types yet.</p>
        ) : (
          <ul>
            {userTypes.map((t) => (
              <li key={t.type}>
                <button
                  className={t.type === type ? "type active" : "type"}
                  onClick={() => pick(t.type)}
                >
                  {t.type} <span className="count">{t.count}</span>
                  {t.origin === "configured" && <span className="tag">cfg</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="syshead">
          <button className="disclosure" onClick={() => setShowSystem((s) => !s)}>
            {showSystem ? "▾" : "▸"} System entities
          </button>
        </h3>
        {showSystem &&
          (systemTypes.length === 0 ? (
            <p className="hint">None.</p>
          ) : (
            <ul>
              {systemTypes.map((t) => (
                <li key={t.type}>
                  <button
                    className={t.type === type ? "type active" : "type"}
                    onClick={() => pick(t.type)}
                  >
                    {t.type} <span className="count">{t.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </aside>

      <div className="content">
        {empty ? (
          <section className="panel">
            <h2>No data yet</h2>
            <p className="hint">
              Install the staffing blueprint (config-as-code) to define the entity
              types, forms, flows, compliance rules, and actions — then seed a demo.
            </p>
            <button onClick={bootstrap} disabled={busy}>
              {busy ? "…" : "Set up staffing demo"}
            </button>
          </section>
        ) : selected ? (
          <>
            <div className="row">
              <button className="ghost" onClick={() => setSelected(null)}>
                ← {type}
              </button>
            </div>
            <EntityDetail id={selected} onOpen={setSelected} />
          </>
        ) : type === null ? (
          <p className="hint">Pick a type.</p>
        ) : (
          <section className="panel">
            <div className="tableHead">
              <h2>{type}</h2>
              <span className="hint">
                {entities ? `${entities.length}` : "…"}
              </span>
            </div>
            {entities === undefined ? (
              <p className="hint">Loading…</p>
            ) : entities.length === 0 ? (
              <p className="hint">No entities of this type.</p>
            ) : (
              <table>
                <tbody>
                  {entities.map((e) => (
                    <tr key={e.id} className="rowlink" onClick={() => setSelected(e.id)}>
                      <td className="attr">{e.name ?? shortId(e.id)}</td>
                      <td className="hint">{e.id}</td>
                      <td>
                        <span className="open-arrow">→</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
