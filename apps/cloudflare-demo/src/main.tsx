import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { MetacrdtClientProvider } from "@metacrdt/client";
import { createCloudflareMetacrdtClient } from "@metacrdt/client-cloudflare";
import {
  DataModel,
  Entities,
  EntityDetail,
  Overview,
  TransactionLog,
} from "@metacrdt/dashboard";
import "./style.css";

const client = createCloudflareMetacrdtClient({
  url: import.meta.env.VITE_METACRDT_CLOUDFLARE_LIVE_QUERY_URL,
  protocol: import.meta.env.VITE_METACRDT_CLOUDFLARE_LIVE_QUERY_PROTOCOL,
  connectionId: import.meta.env.VITE_METACRDT_CLOUDFLARE_CONNECTION_ID,
});

function Shell() {
  return (
    <div>
      <aside>
        <strong>Cloudflare demo</strong>
        <Link to="/">Overview</Link>
        <Link to="/entities">Entities</Link>
        <Link to="/data-model">Data model</Link>
        <Link to="/transactions">Transactions</Link>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/entities" element={<Entities />} />
          <Route path="/e/:id" element={<EntityDetail />} />
          <Route path="/data-model" element={<DataModel />} />
          <Route path="/transactions" element={<TransactionLog />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MetacrdtClientProvider client={client}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </MetacrdtClientProvider>
  </React.StrictMode>,
);
