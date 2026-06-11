import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "./ui";

type Step = {
  route: string;
  eyebrow: string;
  title: string;
  body: string;
  focus: string;
};

const STORAGE_KEY = "metacrdt.tour.dismissed";

const STEPS: Step[] = [
  {
    route: "/",
    eyebrow: "1 / 6 · Substrate",
    title: "Start with the whole account",
    body:
      "The Overview page is the buyer-facing proof: types, placements, evidence reuse, obligations, and transactions are all projections over the same fact log.",
    focus: "Watch the stat cards and compliance table change as facts arrive.",
  },
  {
    route: "/entities",
    eyebrow: "2 / 6 · Facts become objects",
    title: "Inspect entities as folded state",
    body:
      "Entities are not rows in a bespoke app table. They are current projections of facts, ordered by declared schema, with system/configured/data origins kept visible.",
    focus: "Open Worker, Placement, or the component-owned entity section.",
  },
  {
    route: "/compliance",
    eyebrow: "3 / 6 · Rules become obligations",
    title: "Compliance falls out of rules",
    body:
      "Requirements and open tasks are derived facts. Submitting evidence asserts a scoped submission fact; reuse and task clearing are just recomputation.",
    focus: "Set up staffing, submit a form, then compare required vs open.",
  },
  {
    route: "/flows",
    eyebrow: "4 / 6 · Effects park and resume",
    title: "Flows are durable DAGs",
    body:
      "Collect steps park with a token, wait steps park on scheduler ticks, and actions assert facts. The event path resumes the run when the world changes.",
    focus: "Start the onboarding flow for worker:maria and inspect the run timeline.",
  },
  {
    route: "/data-model",
    eyebrow: "5 / 6 · The machine is visible",
    title: "Configuration and engine state are inspectable",
    body:
      "The Data model route exposes config diffs, system processes, action definitions, Datalog, raw fact assertion, and provenance without leaving the app.",
    focus: "Run the sample Datalog query or inspect the action registry.",
  },
  {
    route: "/transactions",
    eyebrow: "6 / 6 · Time is a coordinate",
    title: "Audit is a first-class read model",
    body:
      "The transaction log and bitemporal views show why MetaCRDT is more than current state: history, validity, corrections, and provenance remain queryable.",
    focus: "Compare as-of reads against the newest transaction stream.",
  },
];

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // Ignore private-mode/localStorage failures; the tour remains manually closeable.
  }
}

export default function GuidedTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const step = STEPS[idx]!;

  useEffect(() => {
    if (!open) return;
    if (pathname !== step.route) navigate(step.route);
  }, [idx, navigate, open, pathname, step.route]);

  if (!open) return null;

  const last = idx === STEPS.length - 1;

  function close(remember: boolean) {
    if (remember) setDismissed();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-brand/20" />
      <section className="pointer-events-auto absolute bottom-5 right-5 w-[min(420px,calc(100vw-2.5rem))] rounded-ds border border-line bg-surface shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-ink">
              {step.eyebrow}
            </p>
            <h2 className="mt-1 text-[17px] font-semibold text-ink">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-md p-1 text-muted hover:bg-line-soft hover:text-ink"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-[13px] leading-5 text-ink-2">{step.body}</p>
          <p className="rounded-md border border-line bg-canvas px-3 py-2 text-[12px] leading-5 text-muted">
            {step.focus}
          </p>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-6 bg-brand" : "w-1.5 bg-line"
                }`}
                aria-label={`Go to tour step ${i + 1}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line-soft px-5 py-3.5">
          <Button variant="ghost" onClick={() => close(true)}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (last) close(true);
                else setIdx((i) => i + 1);
              }}
            >
              {last ? "Finish" : "Next"}
              {!last && <ArrowRight className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export { dismissed as tourDismissed };
