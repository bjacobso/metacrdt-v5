import { createContext, createElement, useContext, type ReactNode } from "react";

export type ClientQueryArgs = Record<string, unknown> | "skip";
export type ClientMutation<TResult = any> = (
  args?: Record<string, unknown>,
) => Promise<TResult>;

export type WriteGuard = <T>(
  label: string,
  run: () => Promise<T>,
) => Promise<T | undefined>;

export interface MetacrdtClient {
  readonly useQuery: <T = any>(
    name: string,
    args: ClientQueryArgs,
  ) => T | undefined;
  readonly useMutation: <TResult = any>(name: string) => ClientMutation<TResult>;
  readonly useWriteGuard?: () => WriteGuard;
}

const ClientContext = createContext<MetacrdtClient | null>(null);

export function MetacrdtClientProvider({
  client,
  children,
}: {
  client: MetacrdtClient;
  children: ReactNode;
}) {
  return createElement(ClientContext.Provider, { value: client }, children);
}

export function useMetacrdtClient(): MetacrdtClient {
  const client = useContext(ClientContext);
  if (client === null) {
    throw new Error("MetacrdtClientProvider is required");
  }
  return client;
}

export function useClientQuery<T = any>(
  name: string,
  args: ClientQueryArgs = {},
): T | undefined {
  return useMetacrdtClient().useQuery<T>(name, args);
}

export function useClientMutation<TResult = any>(
  name: string,
): ClientMutation<TResult> {
  return useMetacrdtClient().useMutation<TResult>(name);
}

export function useWriteGuard(): WriteGuard {
  return (
    useMetacrdtClient().useWriteGuard?.() ??
    (async <T,>(_label: string, run: () => Promise<T>) => run())
  );
}

export function createStaticMetacrdtClient(
  fixtures: Record<string, unknown> = {},
): MetacrdtClient {
  return {
    useQuery<T>(name: string): T | undefined {
      return fixtures[name] as T | undefined;
    },
    useMutation(name: string): ClientMutation {
      return async () => {
        throw new Error(`${name} is not available in this demo`);
      };
    },
  };
}
