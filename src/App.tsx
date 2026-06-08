import { Component, ReactNode } from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import { useDeploymentUpdates } from "@convex-dev/static-hosting/react";
import { api } from "../convex/_generated/api";
import Layout from "./Layout";
import Overview from "./pages/Overview";
import Entities from "./pages/Entities";
import EntityDetail from "./pages/EntityDetail";
import ComponentEntity from "./pages/ComponentEntity";
import Compliance from "./pages/Compliance";
import Flows from "./pages/Flows";
import TransactionLog from "./pages/TransactionLog";
import DataModel from "./pages/DataModel";
import Collect from "./pages/Collect";

// A cosmetic live-reload banner, isolated behind an error boundary: it subscribes
// to a component-proxied query that can error on the WS path — a banner must
// never take down the app.
function DeployBanner() {
  const { updateAvailable, reload } = useDeploymentUpdates(
    api.staticHosting.getCurrentDeployment,
  );
  if (!updateAvailable) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-ds border border-orange/30 bg-orange-soft px-4 py-2.5 text-[13px] text-orange-ink">
      A new version was deployed.
      <button className="font-semibold underline" onClick={reload}>
        Reload
      </button>
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

function Shell() {
  return (
    <Layout>
      <Boundary>
        <DeployBanner />
      </Boundary>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Isolated magic-link collection page — no admin chrome. */}
      <Route path="/collect" element={<Collect />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Overview />} />
        <Route path="/entities" element={<Entities />} />
        <Route path="/e/:id" element={<EntityDetail />} />
        <Route path="/component/e/:id" element={<ComponentEntity />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route path="/flows" element={<Flows />} />
        <Route path="/transactions" element={<TransactionLog />} />
        <Route path="/data-model" element={<DataModel />} />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
  );
}
