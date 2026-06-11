import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { MetacrdtClientProvider } from "@metacrdt/client";
import { createNodeMetacrdtClient } from "@metacrdt/client-node";
import {
  DataModel,
  Entities,
  EntityDetail,
  Overview,
  TransactionLog,
} from "@metacrdt/dashboard";
import "./style.css";

const client = createNodeMetacrdtClient({
  baseUrl:
    import.meta.env.VITE_METACRDT_NODE_SYNC_URL ??
    "http://127.0.0.1:8787/sync",
  refreshMs: 5_000,
});

function Shell() {
  return (
    <div>
      <aside>
        <strong>Node demo</strong>
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
