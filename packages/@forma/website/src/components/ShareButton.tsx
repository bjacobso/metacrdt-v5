import { Check, Link } from "lucide-react";
import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_200);
      }}
      title="Copy share URL"
      type="button"
    >
      {copied ? <Check size={17} /> : <Link size={17} />}
      <span>{copied ? "Copied" : "Share"}</span>
    </button>
  );
}
