import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

type Field = {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "select";
  required?: boolean;
  options?: string[];
};

function shortId(s: string): string {
  return s.includes(":") ? s.split(":")[1] : s;
}

/**
 * Isolated, magic-link collection page (route: /collect?token=...). Renders the
 * form's fields from the token, and on submit saves the values + continues the
 * parked workflow. Standalone — no admin tabs.
 */
export default function CollectPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const data = useQuery(api.forms.collectionByToken, token ? { token } : "skip");
  const submit = useMutation(api.forms.submitCollection);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function set(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await submit({ token, values });
      if (res.ok) setDone(true);
    } finally {
      setBusy(false);
    }
  }

  const card = (children: React.ReactNode) => (
    <div className="collect-shell">
      <div className="panel collect-card">{children}</div>
    </div>
  );

  if (!token) return card(<p className="hint">Missing collection token.</p>);
  if (data === undefined) return card(<p className="hint">Loading…</p>);
  if (!data.found) return card(<p className="hint">This collection link is not valid.</p>);
  if (done || data.status !== "waiting")
    return card(
      <>
        <h2>✓ Submitted</h2>
        <p className="hint">
          Your {data.title} for {shortId(data.scope)} was received and the
          workflow has continued. You can close this page.
        </p>
      </>,
    );

  const fields = (data.fields as Field[]) ?? [];

  return card(
    <>
      <h2>{data.title}</h2>
      <p className="hint">
        For <strong>{shortId(data.subject)}</strong> · {shortId(data.scope)}
      </p>
      <form onSubmit={onSubmit} className="collect-form">
        {fields.map((f) => (
          <label key={f.name} className="field">
            <span>
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.type === "boolean" ? (
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
              />
            ) : f.type === "select" ? (
              <select
                value={(values[f.name] as string) ?? ""}
                required={f.required}
                onChange={(e) => set(f.name, e.target.value)}
              >
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                required={f.required}
                value={(values[f.name] as string) ?? ""}
                onChange={(e) =>
                  set(f.name, f.type === "number" ? Number(e.target.value) : e.target.value)
                }
              />
            )}
          </label>
        ))}
        <button type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>
    </>,
  );
}
