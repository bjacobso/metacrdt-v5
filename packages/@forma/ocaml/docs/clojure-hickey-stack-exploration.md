# Clojure / Hickey-Aligned Stack Exploration

> Reference material. This document captures a design exploration of a
> Clojure/Hickey-aligned rewrite of the Onboarded staffing+onboarding app
> (Effect-TS + Prisma + React today). It is kept in this package because
> several themes parallel Open Ontology's own design concerns:
>
> - data-oriented DSLs (routes/schemas as plain data rather than macros)
> - Malli as a schema algebra analog to Effect Schema
> - Datalog queries as the expression language for relational domains
> - event-driven client state patterns (re-frame ↔ effect-atom)
> - "macros as last resort"; data + interpreter as first resort
>
> This is not a proposal for Open Ontology. It is comparative reference
> for the language/DSL work tracked in
> [`specs/compiler/ontology/http-api-authoring.md`](../../../specs/compiler/ontology/http-api-authoring.md)
> and
> [`specs/language/elaboration-time-handlers.md`](./research/elaboration-time-handlers.md).

## Stack Choices (Hickey-aligned)

### Backend

- **Ring + Reitit** — routes defined as data, not macros. Reitit with Malli
  gives you `HttpApi`'s typed contracts more cleanly: one data structure
  drives routing, validation, coercion, and OpenAPI generation.
- **Integrant** for the system graph (what `CurrentAuth`, `Models`, `Db`
  currently do via Effect services). Integrant is pure data describing
  component dependencies — Hickey would approve over Component's protocols.
- **XTDB or Datomic** instead of Postgres + Prisma + Kysely. This is the
  biggest philosophical bet: immutable database, Datalog queries, time as
  a first-class dimension. For a staffing/onboarding domain with audit
  requirements (placements, task history, form submissions) this is
  genuinely simpler — you delete the entire migrations-and-ORM category of
  complexity and get temporal queries for free. If you keep Postgres, it's
  `next.jdbc` + HoneySQL (queries as data).
- **Malli over Spec** — it's data-first, Spec is macro-first. Malli schemas
  ARE maps you can manipulate, generate, transform.
- **Manifold** for async; avoid `core.async` unless you need channels
  specifically.

### Frontend

- **ClojureScript + re-frame.** The Effect Atoms pattern is already
  re-frame-shaped — single `app-db`, events describe what happened, effects
  describe what should happen, subscriptions are reactive views. It's the
  same idea with more rigor.
- **UIx** (not Reagent) — thinner React wrapper, better hooks story.
- **shadow-cljs** for builds.

### The actual shape

Strip the ORM entirely. A client is just
`#:client{:id ... :account-id ... :name ...}` with namespaced keywords that
travel from DB → API → UI unchanged. No DTOs, no mapping layers. Pure
functions take request maps and return response maps:

```clojure
(defn list-clients [{:keys [account db] :as req}]
  {:status 200
   :body (clients/by-account db (:account/id account) (:query-params req))})
```

Multi-tenancy: middleware enriches the request with `:account`, handlers
are pure. No threaded context, no `yield* CurrentAuth` — just data in the
request map.

Error handling: Cognitect's anomalies — errors are categorized maps
(`:cognitect.anomalies/category :incorrect`). Failjure or plain
`[:ok x]`/`[:err e]` tuples if you want typed-ish returns. You lose
Effect's compile-time error tracking; you gain uniformity.

### The On Lisp layer (where to resist Graham)

Hickey explicitly warns against macros-as-first-resort, and he's right
here. The places macros genuinely earn their keep:

- `defendpoint` — declarative endpoint with auth/validation/handler
  wiring.
- Onboarding form DSL — forms are already data in the current code; a
  Clojure version could make the form schema directly executable
  (validation, rendering, submission) without a compile step. This is the
  one place the Graham "bottom-up language" instinct pays off, because
  onboarding forms ARE the core domain.

Everything else: data + an interpreter beats a macro. If you're tempted to
write a macro, write a function that takes data first.

### What actually gets hard

1. **The Prisma schema is load-bearing.** It's the de facto domain model.
   Porting it isn't translation, it's re-deciding what entities exist.
   You'd want to sit with it for weeks before writing code.
2. **Integrations (ActiveCampaign, Tempworks, PDF processing, etc.)** —
   Clojure ecosystem is thinner here. You'd be writing HTTP clients by
   hand with `hato` or `clj-http`.
3. **The Effect → re-frame translation is the easy part**; it's the typed
   API contracts between them (`packages/domain`) that are load-bearing
   and don't have a direct Clojure equivalent beyond "Malli schemas shared
   between server and cljs."
4. **Migration strategy** — strangler fig over shared Postgres is the
   only sane path: new Clojure service beside the existing app, route
   endpoints over gradually. Greenfield rewrite is the graveyard move.

### Honest verdict

The Hickey-pure version (XTDB + Datalog + re-frame + data-everywhere)
would genuinely be simpler in the Hickey sense — fewer interleaved
concerns, less incidental complexity, better REPL story. It would not be
easier: you'd trade a mature TS/Prisma toolchain for a smaller ecosystem
and a hiring pool roughly 100× smaller. The domain (onboarding, temporal
workflows, audit) actually suits Datalog unusually well, which is the one
place I'd say the exercise isn't purely academic.

## Employee Slice, Top to Bottom

Postgres + HoneySQL version (pragmatic) with notes on where
Datomic/XTDB would differ (purist).

### 1. Schema — `onboarded/domain/employee.clj`

Malli replaces Effect Schema. Same idea — runtime + generative + coercion
— but it's just data:

```clojure
(ns onboarded.domain.employee
  (:require [malli.core :as m]
            [onboarded.domain.resource-id :as rid]
            [onboarded.domain.pagination :as pg]))

(def EmployeeId
  [:and :string [:re #"^emp_[A-Za-z0-9]+$"] [:fn rid/valid?]])

(def EmployeeStatus [:enum "pending" "completed" "unassigned" "deleted"])

(def SortField
  [:enum "id" "first_name" "last_name" "email" "created_at"
   "overall_task_progress" "latest_task_updated_at"
   "next_task_due_at" "placements_count"])

(def Address
  [:map
   [:street :string] [:secondary [:maybe :string]]
   [:city :string] [:state :string]
   [:zip [:maybe :string]] [:country :string]
   [:full-address :string]])

(def Employee
  [:map
   [:employee/id EmployeeId]
   [:employee/full-name :string]
   [:employee/first-name {:optional true} [:maybe :string]]
   [:employee/last-name  {:optional true} [:maybe :string]]
   [:employee/email      {:optional true} [:maybe :string]]
   [:employee/date-of-birth [:maybe inst?]]
   [:employee/address       [:maybe Address]]
   [:employee/created-at    inst?]
   [:employee/updated-at    inst?]
   [:employee/overall-task-progress  [:maybe :double]]
   [:employee/latest-task-updated-at [:maybe inst?]]
   [:employee/next-task-due-at       [:maybe inst?]]
   [:employee/tasks      [:vector map?]]
   [:employee/placements [:vector map?]]])

(def ListParams
  (into pg/Query
        [[:order-by     {:optional true} SortField]
         [:order-dir    {:optional true} [:enum "asc" "desc"]]
         [:employee-id  {:optional true} EmployeeId]
         [:first-name   {:optional true} :string]
         [:last-name    {:optional true} :string]
         [:email        {:optional true} :string]
         [:status       {:optional true} EmployeeStatus]
         [:custom-view-id {:optional true} :string]
         [:custom-attributes {:optional true} map?]
         [:system-attributes {:optional true} map?]
         [:progress-min {:optional true} :double]
         [:progress-max {:optional true} :double]]))

(def EmployeeList (pg/paginated Employee))
```

Note the namespaced keywords (`:employee/id`) — this is the Hickey move.
They travel through SQL → handler → JSON → UI unchanged. No DTOs, no
serializers renaming fields. The colon-separation is the namespace.

### 2. Routes — `onboarded.api.internal.employees`

Reitit routes as pure data. This replaces both `EmployeesApi.ts` and
`EmployeesApiLive.server.ts`:

```clojure
(ns onboarded.api.internal.employees
  (:require [onboarded.domain.employee :as emp]
            [onboarded.api.internal.employees.handlers :as h]
            [onboarded.api.middleware :as mw]))

(def routes
  ["/employees"
   {:middleware [mw/authorization mw/request-logger]
    :swagger    {:tags ["Employees"]}}

   ["" {:get {:summary    "List employees"
              :parameters {:query emp/ListParams}
              :responses  {200 {:body emp/EmployeeList}
                           400 {:body mw/BadRequest}}
              :handler    h/list-employees}}]

   ["/migrate_progress"
    {:patch {:parameters {:query [:map
                                  [:source-employee-id emp/EmployeeId]
                                  [:target-employee-id emp/EmployeeId]]}
             :responses  {204 {} 404 {:body mw/NotFound}}
             :handler    h/migrate-progress}}]])
```

The entire API can be walked as a tree and transformed — OpenAPI
generation is `(reitit.swagger/generate routes)`. Type-level, this is
roughly equivalent to the `HttpApi` contract.

### 3. Handler — `onboarded.api.internal.employees.handlers`

Pure function. Account is enriched onto the request by middleware. No
`yield* CurrentAuth`, no `Effect.gen`:

```clojure
(ns onboarded.api.internal.employees.handlers
  (:require [onboarded.models.employee :as employees]
            [onboarded.models.custom-view :as custom-views]
            [onboarded.api.response :as r]))

(defn- build-filters [{:keys [custom-view-id] :as params} {:keys [db account]}]
  (let [view-filters (when custom-view-id
                       (-> (custom-views/find-by-uid db
                             {:uid custom-view-id
                              :account-id (:account/id account)})
                           :custom-view/filters))
        request-filters (select-keys params
                          [:employee-id :first-name :last-name :email :status
                           :custom-attributes :system-attributes
                           :created-at-from :created-at-to
                           :progress-min :progress-max
                           :placements-count-min :placements-count-max])]
    (cond-> []
      view-filters                          (conj view-filters)
      (some some? (vals request-filters))   (conj request-filters))))

(defn list-employees [{:keys [db account parameters] :as req}]
  (let [{:keys [page per-page order-by order-dir] :as params} (:query parameters)
        filters (build-filters params req)
        {:keys [ids total]}
        (employees/paginated-ids db
          {:account-id (:account/id account)
           :filters    filters
           :order-by   order-by
           :order-dir  order-dir
           :page       page
           :per-page   per-page})
        rows (employees/hydrate db {:ids ids})
        by-id (zipmap ids (range))
        sorted (sort-by (comp by-id :employee/id) rows)]
    (r/ok
      {:pagination/total       total
       :pagination/current-page page
       :pagination/per-page    per-page
       :pagination/total-pages (-> total (/ per-page) Math/ceil long)
       :pagination/data        (mapv employees/->public sorted)})))
```

Compare to the 160-line TS handler — no ceremony for services, no
tag-catch pipelines, no decode step (Reitit coerced at the boundary). The
`Effect.catchTag("DbError", Effect.die)` equivalent is "let it throw" —
exceptions in Clojure are already defects by default; middleware at the
edge converts specific ones to 4xx responses.

### 4. Query layer — `onboarded.models.employee`

This is the meaty part. The TypeScript `getPaginatedEmployeesIds` is
building a complex Kysely query with CTEs for computed sort fields. In
Clojure, HoneySQL lets that query be data you can compose:

```clojure
(ns onboarded.models.employee
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as h]
            [next.jdbc :as jdbc]
            [next.jdbc.result-set :as rs]))

(def ^:private sort-column
  {"id"                      :e.id
   "first_name"              :e.first_name
   "last_name"               :e.last_name
   "email"                   :e.email
   "created_at"              :e.created_at
   "overall_task_progress"   :computed.overall_task_progress
   "latest_task_updated_at"  :computed.latest_task_updated_at
   "next_task_due_at"        :computed.next_task_due_at
   "placements_count"        :computed.placements_count})

(defn- apply-filter-block [q block]
  (reduce-kv
    (fn [acc k v]
      (case k
        :first-name (h/where acc [:ilike :e.first_name (str "%" v "%")])
        :email      (h/where acc [:ilike :e.email     (str "%" v "%")])
        :status     (h/where acc [:= :e.status v])
        :progress-min (h/where acc [:>= :computed.overall_task_progress v])
        :progress-max (h/where acc [:<= :computed.overall_task_progress v])
        :custom-attributes
        (reduce-kv (fn [a attr val] (h/where a [:= [:-> :e.custom_attributes attr] val]))
                   acc v)
        acc))
    q block))

(defn- computed-metrics-cte []
  {:computed
   (-> (h/select :t.employee_id
         [[:avg :t.progress]        :overall_task_progress]
         [[:max :t.updated_at]      :latest_task_updated_at]
         [[:min [:case [:= :t.status "pending"] :t.due_at :else nil]]
                                    :next_task_due_at]
         [[:count :p.id]            :placements_count])
       (h/from [:tasks :t])
       (h/left-join [:placements :p] [:= :p.employee_id :t.employee_id])
       (h/group-by :t.employee_id))})

(defn paginated-ids [db {:keys [account-id filters order-by order-dir page per-page]}]
  (let [base (-> (h/with (computed-metrics-cte))
                 (h/from [:employees :e])
                 (h/left-join [:computed] [:= :computed.employee_id :e.id])
                 (h/where [:= :e.account_id account-id]
                          [:= :e.deleted_at nil]))
        filtered (reduce apply-filter-block base filters)
        col      (sort-column order-by :e.created_at)
        dir      (if (= order-dir "asc") :asc :desc)
        rows (jdbc/execute! db
               (-> filtered
                   (h/select :e.id [[:count :*] :over [] :as :total])
                   (h/order-by [col dir])
                   (h/limit per-page)
                   (h/offset (* (dec page) per-page))
                   sql/format)
               {:builder-fn rs/as-unqualified-kebab-maps})]
    {:ids   (mapv :id rows)
     :total (or (-> rows first :total) 0)}))

(defn hydrate [db {:keys [ids]}]
  (when (seq ids)
    (jdbc/execute! db
      (sql/format
        {:select [:e.* :a.* :p.* :t.* :tpl.*]
         :from   [[:employees :e]]
         :left-join [[:addresses    :a]   [:= :a.id :e.address_id]
                     [:placements   :p]   [:= :p.employee_id :e.id]
                     [:tasks        :t]   [:= :t.employee_id :e.id]
                     [:task_templates :tpl] [:= :tpl.id :t.template_id]]
         :where  [:in :e.id ids]})
      {:builder-fn rs/as-kebab-maps})))

(defn ->public [row]
  {:employee/id          (:employee/id row)
   :employee/full-name   (str (:employee/first-name row) " " (:employee/last-name row))
   :employee/first-name  (:employee/first-name row)
   :employee/last-name   (:employee/last-name row)
   :employee/email       (:employee/email row)
   :employee/date-of-birth (:employee/date-of-birth row)
   :employee/address     (some-> (:address/id row) (-> row (select-keys [...])))
   :employee/created-at  (:employee/created-at row)
   :employee/updated-at  (:employee/updated-at row)
   :employee/overall-task-progress  (:computed/overall-task-progress row)
   :employee/latest-task-updated-at (:computed/latest-task-updated-at row)
   :employee/next-task-due-at       (:computed/next-task-due-at row)
   :employee/tasks       (:employee/tasks row)
   :employee/placements  (:employee/placements row)})
```

The `apply-filter-block` reduce is where Clojure's data-is-code pays off
— filters are maps, the query is a map, and composition is just
`reduce`. No ORM abstractions to fight.

### 4b. XTDB / Datomic Datalog version

Would replace all of the above with one Datalog query. The computed
metrics aren't a CTE — they're aggregates in the `:find` clause.
Genuinely shorter, and you get bitemporal audit for free (every employee
state change queryable "as of" any timestamp — which matters for a
staffing app with compliance):

```clojure
(xt/q db
  '{:find  [?e (avg ?progress) (max ?t-updated) (count ?p)]
    :in    [$ ?account ?page ?per]
    :where [[?e :employee/account  ?account]
            [?e :employee/deleted-at nil]
            [?t :task/employee     ?e]
            [?t :task/progress     ?progress]
            [?t :task/updated-at   ?t-updated]
            [?p :placement/employee ?e]]
    :order-by [[(avg ?progress) :desc]]
    :limit    ?per
    :offset   (* (dec ?page) ?per)}
  account-id page per-page)
```

### 5. Server wiring — `onboarded.api.internal.api`

The `InternalApiLive` equivalent. Just plain data:

```clojure
(ns onboarded.api.internal.api
  (:require [reitit.ring :as ring]
            [reitit.ring.coercion :as rrc]
            [reitit.coercion.malli :as rcm]
            [reitit.ring.middleware.muuntaja :as mm]
            [muuntaja.core :as mu]
            [onboarded.api.internal.employees :as employees]
            [onboarded.api.internal.clients   :as clients]
            [onboarded.api.middleware :as mw]))

(defn app [{:keys [db redis jwt]}]
  (ring/ring-handler
    (ring/router
      [["/api/internal"
        {:middleware [(mw/inject-deps {:db db :redis redis :jwt jwt})
                      mw/auth-context]}
        employees/routes
        clients/routes]]
      {:data {:coercion   rcm/coercion
              :muuntaja   mu/instance
              :middleware [mm/format-middleware
                           rrc/coerce-exceptions-middleware
                           rrc/coerce-request-middleware
                           rrc/coerce-response-middleware]}})))
```

Integrant assembles `db`, `redis`, `jwt` and passes them in. No
`Layer.provide(...)` chain — just dependency maps.

### 6. Client state — `onboarded.app.employees.state`

re-frame version of the atom. The pattern is strikingly close to Effect
Atoms because both are descendants of the same idea (events describe
intent; subscriptions are reactive views):

```clojure
(ns onboarded.app.employees.state
  (:require [re-frame.core :as rf]
            [onboarded.app.api :as api]))

(rf/reg-event-fx ::fetch
  (fn [{:keys [db]} [_ params]]
    {:db (assoc-in db [:employees :loading?] true)
     :fx [[:api/get {:path     "/api/internal/employees"
                     :query    params
                     :on-success [::fetch-success]
                     :on-failure [::fetch-failure]}]]}))

(rf/reg-event-db ::fetch-success
  (fn [db [_ response]]
    (-> db
        (assoc-in [:employees :loading?] false)
        (assoc-in [:employees :data]     (:pagination/data response))
        (assoc-in [:employees :total]    (:pagination/total response)))))

(rf/reg-sub ::list        (fn [db] (get-in db [:employees :data] [])))
(rf/reg-sub ::total       (fn [db] (get-in db [:employees :total] 0)))
(rf/reg-sub ::loading?    (fn [db] (get-in db [:employees :loading?] false)))

;; URL params → fetch, Hickey-style: state is the URL, events keep it in sync
(rf/reg-event-fx ::route-changed
  (fn [_ [_ {:keys [page per-page status search]}]]
    {:fx [[:dispatch [::fetch {:page (or page 1) :per-page (or per-page 25)
                               :status status :search search}]]]}))
```

The single-`app-db` discipline — there's exactly one piece of state,
events are the only way to change it, subscriptions derive views. This is
more rigorous than Effect Atoms, not less: you genuinely can't "reach
into" components' local state.

`reactivityKeys` equivalent: either manual `(rf/dispatch [::fetch ...])`
after mutations, or a library like `re-frame-http-fx` + cache TTL. Less
magic, more explicit.

### 7. Component — `onboarded.app.employees.views`

UIx (thin React wrapper, hooks work normally):

```clojure
(ns onboarded.app.employees.views
  (:require [uix.core :refer [$ defui]]
            [re-frame.core :as rf]
            [onboarded.app.employees.state :as s]
            [onboarded.app.ui.table :as table]))

(defui employee-row [{:keys [employee]}]
  ($ table/row
    ($ table/cell (:employee/full-name employee))
    ($ table/cell (:employee/email employee))
    ($ table/cell {:class "ds-text-1"}
       (some-> (:employee/overall-task-progress employee) (* 100) int (str "%")))
    ($ table/cell (some-> (:employee/next-task-due-at employee) format-date))))

(defui employees-page []
  (let [employees (rf/subscribe [::s/list])
        total     (rf/subscribe [::s/total])
        loading?  (rf/subscribe [::s/loading?])]
    ($ :div
      ($ :h1 "Employees")
      (if @loading?
        ($ table/skeleton)
        ($ table/root
           ($ table/header ["Name" "Email" "Progress" "Next due"])
           (for [e @employees]
             ($ employee-row {:key (:employee/id e) :employee e}))))
      ($ :div {:class "ds-text-2"} (str "Total: " @total)))))
```

## What the whole slice looks like as a directory

```text
packages/domain/src/
  onboarded/domain/employee.clj          # 60 lines (vs ~200 TS)

apps/web/src/
  onboarded/api/internal/employees.clj   # routes, 30 lines
  onboarded/api/internal/employees/
    handlers.clj                         # 40 lines
  onboarded/models/employee.clj          # ~80 lines Kysely → HoneySQL
  onboarded/app/employees/
    state.clj                            # re-frame, 40 lines
    views.clj                            # UIx, 30 lines
```

Rough count: ~280 lines of Clojure to replace ~600 lines of TypeScript
across the equivalent files. The saving isn't magic — it's (1)
namespaced keywords deleting the serializer layer, (2) Reitit+Malli
collapsing contract + route + handler-registration into one data
structure, (3) losing Effect's explicit service-wiring ceremony.

## Where the translation is dishonest

Three places this is lying slightly:

1. **Typed errors.** Effect's `addError(BadRequestError, { status: 400 })`
   forces call-sites to handle it. The Clojure version relies on
   discipline + runtime checks. Spec/Malli don't give you the same
   compile-time pressure.
2. **`args.urlParams` typing.** In TS it's inferred from the schema.
   Malli can generate a spec you coerce against, but the handler sees a
   plain map — typos in `(:first-name params)` vs `(:first_name params)`
   become runtime bugs.
3. **`custom_attributes` JSON parsing.** The original TS handler parses a
   JSON query-string param — the Clojure version inherits that same wart
   unless you fix it at the schema layer, which you should.

## Relevance to Open Ontology

The HTTP API Authoring DSL spec
([`specs/compiler/ontology/http-api-authoring.md`](../../../specs/compiler/ontology/http-api-authoring.md))
is pursuing the same design instinct as the Reitit + Malli pairing
described above: **routes, schemas, and error contracts as plain data
that is walked by translators, not a macro expansion of a procedural DSL.**
Several of this document's observations transfer directly:

- Namespaced keywords for round-trip field identity → our
  `:entity-type/attr-name` triple convention.
- Malli schemas as manipulable data → our schema algebra ADT.
- "Macros as last resort; data + interpreter first" → our elaboration-time
  handlers primitive in
  [`specs/language/elaboration-time-handlers.md`](./research/elaboration-time-handlers.md).
- Integrant's dependency maps → our capability records.
- Datalog over bitemporal triples → our existing triple store + Datalog.

The Clojure stack arrives at many of the same conclusions by a different
route. The divergences (typed errors, compile-time contract pressure) are
exactly the places Open Ontology's static elaboration story is designed
to outperform the dynamic-by-default Clojure ceiling.
