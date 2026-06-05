import { Component, ReactNode, useState } from "react";
import { useDeploymentUpdates } from "@convex-dev/static-hosting/react";
import { api } from "../convex/_generated/api";
import Data from "./Data";
import Workflows from "./Workflows";
import Compliance from "./Compliance";
import TimeTravel from "./TimeTravel";
import System from "./System";
import CollectPage from "./CollectPage";

type Tab = "data" | "workflows" | "compliance" | "timetravel" | "system";

const TABS: { id: Tab; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "workflows", label: "Workflows" },
  { id: "compliance", label: "Compliance" },
  { id: "timetravel", label: "Time travel" },
  { id: "system", label: "System" },
];

// A cosmetic live-reload banner. Isolated behind an error boundary because it
// subscribes to a component-proxied query — if that subscription errors, the
// banner should disappear, never take down the whole app.
function DeployBanner() {
  const { updateAvailable, reload } = useDeploymentUpdates(
    api.staticHosting.getCurrentDeployment,
  );
  if (!updateAvailable) return null;
  return (
    <div className="banner">
      A new version was deployed.
      <button onClick={reload}>Reload</button>
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("data");

  // Isolated magic-link collection page — no admin chrome.
  if (window.location.pathname === "/collect") {
    return <CollectPage />;
  }

  return (
    <main>
      <Boundary>
        <DeployBanner />
      </Boundary>
      <h1>Triple Store</h1>
      <p className="sub">
        A bitemporal triple store, Datalog engine, durable flows, and an emergent
        compliance engine on Convex — modeled as a small SaaS over the substrate.
      </p>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "data" ? (
        <Data />
      ) : tab === "workflows" ? (
        <Workflows />
      ) : tab === "compliance" ? (
        <Compliance />
      ) : tab === "timetravel" ? (
        <TimeTravel />
      ) : (
        <System />
      )}
    </main>
  );
}
