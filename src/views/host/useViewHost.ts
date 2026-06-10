import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueries, type RequestForQueries } from "convex/react";
import type { Value } from "convex/values";
import { useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { useWriteGate } from "../../auth";
import type { ViewRenderContext } from "../ViewRenderer";
import {
  evaluateViewExpression,
  evaluateViewValue,
  getValueAtPath,
  initializeViewState,
  isRecord,
  patchValueAtPath,
  setValueAtPath,
  type ViewExpressionContext,
  type ViewSpec,
} from "@metacrdt/views/runtime";
import { lookupQuery } from "./queryRegistry";

type ViewActionLike = {
  readonly action?: string;
  readonly key?: string;
  readonly value?: unknown;
  readonly path?: unknown;
  readonly message?: unknown;
  readonly description?: unknown;
  readonly actionRef?: string;
  readonly name?: unknown;
  readonly entityId?: unknown;
  readonly entity?: unknown;
  readonly parameters?: Record<string, unknown>;
  readonly queries?: readonly string[];
  readonly query?: string;
  readonly onSuccess?: ViewActionInput;
  readonly onError?: ViewActionInput;
  readonly onFinally?: ViewActionInput;
};

type ViewActionInput = ViewActionLike | readonly ViewActionLike[] | undefined;

type Toast = {
  id: number;
  message: string;
  description?: string;
  variant?: string;
};

type QueryResultState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "success"; data: unknown };

const EMPTY_INPUT: Record<string, unknown> = {};

function actionList(actionOrList: ViewActionInput): readonly ViewActionLike[] {
  if (actionOrList === undefined) return [];
  return Array.isArray(actionOrList)
    ? (actionOrList as readonly ViewActionLike[])
    : [actionOrList as ViewActionLike];
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalizeQueryResult(value: unknown): QueryResultState {
  if (value instanceof Error) return { status: "error", error: value };
  if (
    isRecord(value) &&
    typeof value["status"] === "string" &&
    ["loading", "error", "success"].includes(value["status"])
  ) {
    if (value["status"] === "loading") return { status: "loading" };
    if (value["status"] === "error") {
      return { status: "error", error: value["error"] };
    }
    return { status: "success", data: value["data"] };
  }
  if (value === undefined) return { status: "loading" };
  return { status: "success", data: value };
}

function evaluatedRecord(
  value: Record<string, unknown> | undefined,
  ctx: ViewExpressionContext,
): Record<string, unknown> {
  const evaluated = evaluateViewValue(value ?? {}, ctx);
  return isRecord(evaluated) ? evaluated : {};
}

export function useViewHost(
  spec: ViewSpec,
  input: Record<string, unknown> = EMPTY_INPUT,
) {
  const stableInput = input;
  const navigate = useNavigate();
  const runAction = useMutation(api.actions.runAction);
  const { guardWrite } = useWriteGate();
  const [state, setState] = useState(() => initializeViewState(spec.state));
  const [toasts, setToasts] = useState<Toast[]>([]);

  const baseCtx = useMemo<ViewExpressionContext>(
    () => ({ state, input: stableInput, query: {} }),
    [stableInput, state],
  );

  const queryConfigKey = JSON.stringify(spec.queries ?? {});
  const bindings = useMemo(
    () => Object.entries(spec.queries ?? {}),
    [queryConfigKey],
  );
  const unknownBindings = useMemo(
    () =>
      bindings
        .filter(([, binding]) => {
          const ref = isRecord(binding) ? binding["queryRef"] : undefined;
          return typeof ref !== "string" || lookupQuery(ref) === undefined;
        })
        .map(([name, binding]) => {
          const ref = isRecord(binding) ? binding["queryRef"] : undefined;
          return `Unknown query binding "${name}"${typeof ref === "string" ? ` (${ref})` : ""}`;
        }),
    [bindings],
  );

  const requests = useMemo(() => {
    const out: RequestForQueries = {};
    for (const [name, binding] of bindings) {
      if (!isRecord(binding) || typeof binding["queryRef"] !== "string") {
        continue;
      }
      const entry = lookupQuery(binding["queryRef"]);
      if (!entry) continue;
      const params = evaluatedRecord(
        isRecord(binding["params"])
          ? (binding["params"] as Record<string, unknown>)
          : undefined,
        baseCtx,
      );
      out[name] = {
        query: entry.fn,
        args: entry.args(params) as Record<string, Value>,
      };
    }
    return out;
  }, [baseCtx, bindings]);

  const rawResults = useQueries(requests);

  const { query, loading, errors } = useMemo(() => {
    const queryValues: Record<string, unknown> = {};
    const nextErrors = [...unknownBindings];
    let hasLoading = false;

    for (const [name, request] of Object.entries(requests)) {
      const raw = (rawResults as Record<string, unknown>)[name];
      const normalized = normalizeQueryResult(raw);
      if (normalized.status === "loading") {
        hasLoading = true;
        queryValues[name] = null;
        continue;
      }
      if (normalized.status === "error") {
        nextErrors.push(
          `Query "${name}" failed: ${display(normalized.error) || "unknown error"}`,
        );
        queryValues[name] = null;
        continue;
      }

      const binding = bindings.find(([bindingName]) => bindingName === name)?.[1];
      const ref = isRecord(binding) ? binding["queryRef"] : undefined;
      const entry = typeof ref === "string" ? lookupQuery(ref) : undefined;
      queryValues[name] = entry?.select
        ? entry.select(normalized.data)
        : normalized.data;
      void request;
    }

    return { query: queryValues, loading: hasLoading, errors: nextErrors };
  }, [bindings, rawResults, requests, unknownBindings]);

  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3000);
  }, []);

  const dispatch = useCallback(
    async (
      actionOrList: ViewActionInput,
      scope: Partial<ViewExpressionContext> = {},
    ) => {
      const dispatchActions = async (
        nextActionOrList: ViewActionInput,
        nextScope: Partial<ViewExpressionContext>,
        initialState: Record<string, unknown>,
      ): Promise<Record<string, unknown>> => {
        let currentState = initialState;
        const runChild = async (
          child: ViewActionInput,
          childScope: Partial<ViewExpressionContext> = nextScope,
        ) => {
          currentState = await dispatchActions(child, childScope, currentState);
        };

        for (const action of actionList(nextActionOrList)) {
          if (!action || typeof action.action !== "string") continue;
          const scopedCtx: ViewExpressionContext = {
            state: currentState,
            input: stableInput,
            query,
            ...nextScope,
          };
          try {
            if (action.action === "setState" && typeof action.key === "string") {
              const value = evaluateViewValue(action.value, scopedCtx);
              currentState = setValueAtPath(
                currentState,
                action.key,
                value,
              ) as Record<string, unknown>;
              setState(currentState);
              await runChild(action.onSuccess);
            } else if (
              action.action === "patchState" &&
              typeof action.key === "string"
            ) {
              const value = evaluateViewValue(action.value, scopedCtx);
              currentState = patchValueAtPath(
                currentState,
                action.key,
                value,
              ) as Record<string, unknown>;
              setState(currentState);
              await runChild(action.onSuccess);
            } else if (
              action.action === "toggleState" &&
              typeof action.key === "string"
            ) {
              currentState = setValueAtPath(
                currentState,
                action.key,
                !Boolean(getValueAtPath(currentState, action.key)),
              ) as Record<string, unknown>;
              setState(currentState);
              await runChild(action.onSuccess);
            } else if (action.action === "navigate") {
              const rawPath = evaluateViewExpression(action.path, scopedCtx);
              const path = display(rawPath);
              if (path.includes(":") && !path.startsWith("/")) {
                navigate(`/e/${encodeURIComponent(path)}`);
              } else if (path !== "") {
                navigate(path);
              }
              await runChild(action.onSuccess);
            } else if (action.action === "showToast") {
              pushToast({
                message: display(evaluateViewExpression(action.message, scopedCtx)),
                description: action.description
                  ? display(evaluateViewExpression(action.description, scopedCtx))
                  : undefined,
                variant: "variant" in action ? display(action["variant"]) : undefined,
              });
              await runChild(action.onSuccess);
            } else if (action.action === "executeAction") {
              const actionName = display(
                evaluateViewExpression(action.actionRef ?? action.name, scopedCtx),
              );
              const entity = display(
                evaluateViewExpression(action.entityId ?? action.entity, scopedCtx),
              );
              const args = evaluatedRecord(action.parameters, scopedCtx);
              if (actionName === "" || entity === "") {
                throw new Error("executeAction requires actionRef and entityId");
              }
              const result = await guardWrite(`Run ${actionName}`, () =>
                runAction({ action: actionName, entity, args }),
              );
              if (result !== undefined) {
                pushToast({ message: `${actionName} complete` });
                await runChild(action.onSuccess, { ...nextScope, $result: result });
              }
            } else if (
              action.action === "runQuery" ||
              action.action === "runQueries"
            ) {
              console.debug("View query actions are no-ops; Convex subscriptions are live.", {
                query: action.query,
                queries: action.queries,
              });
              await runChild(action.onSuccess);
            } else {
              console.debug(`Unsupported ViewAction ignored: ${action.action}`, action);
            }
          } catch (err) {
            console.error("View action failed", err);
            pushToast({
              message: "View action failed",
              description: display(err),
              variant: "error",
            });
            await runChild(action.onError, { ...nextScope, $error: err });
          } finally {
            await runChild(action.onFinally);
          }
        }
        return currentState;
      };

      await dispatchActions(actionOrList, scope, state);
    },
    [guardWrite, navigate, pushToast, query, runAction, stableInput, state],
  );

  const ctx = useMemo<ViewRenderContext>(
    () => ({
      state,
      input: stableInput,
      query,
      dispatch: (actionOrList, scope) => {
        void dispatch(actionOrList as ViewActionInput, scope);
      },
    }),
    [dispatch, query, stableInput, state],
  );

  return { ctx, dispatch, loading, errors, toasts };
}
