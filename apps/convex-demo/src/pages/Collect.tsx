import { ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "../ui";

type Field = {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "select";
  required?: boolean;
  options?: string[];
};

function shortId(s: string): string {
  return s.includes(":") ? s.split(":").slice(1).join(":") : s;
}

/**
 * Isolated, magic-link collection page (route: /collect?token=...). Renders the
 * form's fields from the token and, on submit, saves the values + continues the
 * parked workflow. Standalone — no admin chrome.
 */
export default function Collect() {
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

  const shell = (children: ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-ds border border-line bg-surface p-7 shadow-pop">
        {children}
      </div>
    </div>
  );

  const inputCls =
    "rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line";

  if (!token) return shell(<p className="text-[13px] text-muted">Missing collection token.</p>);
  if (data === undefined) return shell(<p className="text-[13px] text-muted">Loading…</p>);
  if (!data.found)
    return shell(<p className="text-[13px] text-muted">This collection link is not valid.</p>);
  if (done || data.status !== "waiting")
    return shell(
      <>
        <h2 className="text-lg font-semibold text-green">✓ Submitted</h2>
        <p className="mt-2 text-[13px] text-muted">
          Your {data.title} for {shortId(data.scope)} was received and the workflow
          has continued. You can close this page.
        </p>
      </>,
    );

  const fields = (data.fields as Field[]) ?? [];

  return shell(
    <>
      <h2 className="text-xl font-semibold text-ink">{data.title}</h2>
      <p className="mt-1 text-[13px] text-muted">
        For <span className="font-medium text-ink">{shortId(data.subject)}</span> ·{" "}
        {shortId(data.scope)}
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-2">
              {f.label}
              {f.required ? " *" : ""}
            </span>
            {f.type === "boolean" ? (
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
                className="h-4 w-4"
              />
            ) : f.type === "select" ? (
              <select
                value={(values[f.name] as string) ?? ""}
                required={f.required}
                onChange={(e) => set(f.name, e.target.value)}
                className={`${inputCls} w-full`}
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
                className={`${inputCls} w-full`}
              />
            )}
          </label>
        ))}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? "Submitting…" : "Submit"}
        </Button>
      </form>
    </>,
  );
}
