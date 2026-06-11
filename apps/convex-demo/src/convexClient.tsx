import { useMemo, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  MetacrdtClientProvider,
  type ClientQueryArgs,
  type MetacrdtClient,
} from "@metacrdt/client";
import { api } from "../convex/_generated/api";
import { useWriteGate } from "./auth";

const queries = {
  "actions.actionsForType": api.actions.actionsForType,
  "actions.listActions": api.actions.listActions,
  "attributes.typeSchemaAsOf": api.attributes.typeSchemaAsOf,
  "compliance.workerCompliance": api.compliance.workerCompliance,
  "configHistory.currentManifest": api.configHistory.currentManifest,
  "configHistory.history": api.configHistory.history,
  "datalog.datalog": api.datalog.datalog,
  "entities.entityDetail": api.entities.entityDetail,
  "entities.listEntities": api.entities.listEntities,
  "entities.listEntityTypes": api.entities.listEntityTypes,
  "entities.queryEntities": api.entities.queryEntities,
  "facts.entityFactsAsOf": api.facts.entityFactsAsOf,
  "facts.entityTimeline": api.facts.entityTimeline,
  "flows.flowsForType": api.flows.flowsForType,
  "flows.listFlowDefs": api.flows.listFlowDefs,
  "flows.listFlows": api.flows.listFlows,
  "metacrdtComponent.getOwnedCurrentEntity":
    api.metacrdtComponent.getOwnedCurrentEntity,
  "metacrdtComponent.listOwnedCollections":
    api.metacrdtComponent.listOwnedCollections,
  "metacrdtComponent.listOwnedCurrentEntities":
    api.metacrdtComponent.listOwnedCurrentEntities,
  "metacrdtComponent.listOwnedEvents": api.metacrdtComponent.listOwnedEvents,
  "metacrdtComponent.listOwnedFlowRuns":
    api.metacrdtComponent.listOwnedFlowRuns,
  "metacrdtComponent.ownedCompliancePlan":
    api.metacrdtComponent.ownedCompliancePlan,
  "overview.recentActivity": api.overview.recentActivity,
  "overview.summary": api.overview.summary,
  "system.listSystemProcesses": api.system.listSystemProcesses,
} as const;

const mutations = {
  "actions.runAction": api.actions.runAction,
  "appconfig.setupStaffing": api.appconfig.setupStaffing,
  "compliance.submitForm": api.compliance.submitForm,
  "facts.assertFact": api.facts.assertFact,
  "flows.cancelFlow": api.flows.cancelFlow,
  "flows.issueAllOpen": api.flows.issueAllOpen,
  "flows.startFlow": api.flows.startFlow,
  "metacrdtComponent.issueOwnedOpenCollections":
    api.metacrdtComponent.issueOwnedOpenCollections,
  "metacrdtComponent.materializeOwnedCompliance":
    api.metacrdtComponent.materializeOwnedCompliance,
  "metacrdtComponent.runOwnedAction": api.metacrdtComponent.runOwnedAction,
  "metacrdtComponent.startOwnedFlow": api.metacrdtComponent.startOwnedFlow,
} as const;

function namedQuery<T>(name: string, args: ClientQueryArgs): T | undefined {
  const query = queries[name as keyof typeof queries];
  if (query === undefined) {
    throw new Error(`Unknown MetaCRDT query: ${name}`);
  }
  return useQuery(query as never, args as never) as T | undefined;
}

function namedMutation(name: string) {
  const mutation = mutations[name as keyof typeof mutations];
  if (mutation === undefined) {
    throw new Error(`Unknown MetaCRDT mutation: ${name}`);
  }
  return useMutation(mutation as never) as (
    args?: Record<string, unknown>,
  ) => Promise<any>;
}

export function ConvexMetacrdtClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { guardWrite } = useWriteGate();
  const client = useMemo<MetacrdtClient>(
    () => ({
      useQuery: namedQuery,
      useMutation: namedMutation,
      useWriteGuard: () => guardWrite,
    }),
    [guardWrite],
  );

  return (
    <MetacrdtClientProvider client={client}>
      {children}
    </MetacrdtClientProvider>
  );
}
