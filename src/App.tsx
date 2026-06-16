import { useEffect, useState } from "react";
import { Routes, Route, Outlet, Navigate } from "react-router-dom";
import { useQuery_experimental as useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Layout from "./Layout";
import Overview from "./pages/Overview";
import Entities from "./pages/Entities";
import EntityDetail from "./pages/EntityDetail";
import ComponentEntity from "./pages/ComponentEntity";
import Compliance from "./pages/Compliance";
import Flows from "./pages/Flows";
import TransactionLog from "./pages/TransactionLog";
import SystemConsole from "./pages/SystemConsole";
import Collect from "./pages/Collect";
import AccountConfig from "./pages/AccountConfig";
import { TenantProvider } from "./tenant";
import { ROUTES } from "./navigationModel";

function useSafeDeploymentUpdates() {
  const deployment = useQuery({
    query: api.staticHosting.getCurrentDeployment,
    args: {},
    throwOnError: false,
  });
  const [initialDeploymentId, setInitialDeploymentId] = useState<string | null>(
    null,
  );
  const [dismissedDeploymentId, setDismissedDeploymentId] = useState<
    string | null
  >(null);

  const currentDeploymentId =
    deployment.status === "success" && deployment.data !== null
      ? deployment.data.currentDeploymentId
      : null;

  useEffect(() => {
    if (currentDeploymentId !== null && initialDeploymentId === null) {
      setInitialDeploymentId(currentDeploymentId);
    }
  }, [currentDeploymentId, initialDeploymentId]);

  return {
    updateAvailable:
      currentDeploymentId !== null &&
      initialDeploymentId !== null &&
      currentDeploymentId !== initialDeploymentId &&
      currentDeploymentId !== dismissedDeploymentId,
    reload: () => window.location.reload(),
    dismiss: () => setDismissedDeploymentId(currentDeploymentId),
  };
}

// A cosmetic live-reload banner. We use Convex's non-throwing object-form query
// instead of @convex-dev/static-hosting's helper hook, because that helper wraps
// the component-proxied query in throwing `useQuery`; transient WS/component
// errors should hide this banner, not tear down the app.
function DeployBanner() {
  const { updateAvailable, reload, dismiss } = useSafeDeploymentUpdates();
  if (!updateAvailable) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-ds border border-orange/30 bg-orange-soft px-4 py-2.5 text-[13px] text-orange-ink">
      A new version was deployed.
      <button className="font-semibold underline" onClick={reload}>
        Reload
      </button>
      <button className="text-orange-ink/70 underline" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}

function Shell() {
  return (
    <TenantProvider>
      <Layout>
        <DeployBanner />
        <Outlet />
      </Layout>
    </TenantProvider>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Isolated magic-link collection page — no admin chrome. */}
      <Route path="/collect" element={<Collect />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Overview />} />
        <Route path={ROUTES.entities} element={<Entities />} />
        <Route path="/e/:id" element={<EntityDetail />} />
        <Route path="/component/e/:id" element={<ComponentEntity />} />
        <Route path={ROUTES.compliance} element={<Compliance />} />
        <Route path={ROUTES.flows} element={<Flows />} />
        <Route path={ROUTES.accountConfig} element={<AccountConfig />} />
        <Route path={ROUTES.systemConsole} element={<SystemConsole />} />
        <Route path={ROUTES.transactions} element={<TransactionLog />} />
        <Route
          path={ROUTES.legacyDataModel}
          element={<Navigate to={ROUTES.systemConsole} replace />}
        />
        <Route path="*" element={<Overview />} />
      </Route>
      <Route path="/t/:tenantSlug" element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="entities" element={<Entities />} />
        <Route path="e/:id" element={<EntityDetail />} />
        <Route path="component/e/:id" element={<ComponentEntity />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="flows" element={<Flows />} />
        <Route path="config" element={<AccountConfig />} />
        <Route path="system" element={<SystemConsole />} />
        <Route path="transactions" element={<TransactionLog />} />
        <Route
          path="data-model"
          element={<Navigate to="../system" replace />}
        />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
  );
}
