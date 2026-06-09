# Employee Slice: Clojure ↔ Open Ontology Lisp, Side by Side

Companion to [`clojure-hickey-stack-exploration.md`](./clojure-hickey-stack-exploration.md).

For every layer of the Clojure/Hickey-aligned sketch, this document shows
the equivalent in the Open Ontology Lisp DSL surface specified in
[`specs/compiler/ontology/http-api-authoring.md`](../../../specs/compiler/ontology/http-api-authoring.md)
and
[`specs/language/elaboration-time-handlers.md`](./research/elaboration-time-handlers.md).

The point is to make the design tradeoff concrete: the two languages arrive
at similar data-first shapes from different directions. Open Ontology's
Lisp keeps the data-shaped surface, adds static elaboration and typed
schemas, and targets a portable IR instead of direct Clojure evaluation.

Sections pair the Clojure fragment from the exploration doc with the
equivalent Open Ontology Lisp. Speculative pieces (the client-side DSL,
the deployment form) are marked inline — they are consistent with the
existing specs but not yet implemented.

## 1. Schema

### Clojure (Malli)

```clojure
(def EmployeeId
  [:and :string [:re #"^emp_[A-Za-z0-9]+$"] [:fn rid/valid?]])

(def EmployeeStatus [:enum "pending" "completed" "unassigned" "deleted"])

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
   [:employee/email {:optional true} [:maybe :string]]
   [:employee/date-of-birth [:maybe inst?]]
   [:employee/address       [:maybe Address]]
   [:employee/created-at    inst?]
   [:employee/overall-task-progress  [:maybe :double]]
   [:employee/tasks      [:vector map?]]
   [:employee/placements [:vector map?]]])

(def EmployeeList (pg/paginated Employee))
```

### Open Ontology Lisp

```lisp
(define-schema EmployeeId
  (:kind   string)
  (:pattern #"^emp_[A-Za-z0-9]+$")
  (:brand  "EmployeeId")
  (:doc    "Opaque employee identifier"))

(define-schema EmployeeStatus
  (:kind union)
  (:variants
    (literal "pending")
    (literal "completed")
    (literal "unassigned")
    (literal "deleted")))

(define-schema Address
  (:kind struct)
  (:fields
    (field street       String)
    (field secondary    (Optional String))
    (field city         String)
    (field state        String)
    (field zip          (Optional String))
    (field country      String)
    (field full-address String))
  (:identifier "Address"))

(define-schema Employee
  (:kind struct)
  (:fields
    (field id                       EmployeeId)
    (field full-name                String)
    (field first-name               (Optional String))
    (field last-name                (Optional String))
    (field email                    (Optional String))
    (field date-of-birth            (Optional Instant))
    (field address                  (Optional Address))
    (field created-at               Instant)
    (field updated-at               Instant)
    (field overall-task-progress    (Optional Float))
    (field latest-task-updated-at   (Optional Instant))
    (field next-task-due-at         (Optional Instant))
    (field tasks                    (Array Task))
    (field placements               (Array Placement)))
  (:identifier "Employee"))

(define-schema EmployeeList
  (:kind struct)
  (:fields
    (field total        Int)
    (field current-page Int)
    (field per-page     Int)
    (field total-pages  Int)
    (field data         (Array Employee)))
  (:identifier "EmployeeList"))
```

**Translation notes.**

- Malli keywords at the field level map to named schema declarations. In
  OO Lisp the schema algebra is the first-class thing (see `(Array X)`,
  `(Optional X)` as type constructors); each named schema lowers to a
  `SchemaDecl` IR node.
- The `[:and :string [:re …] [:fn rid/valid?]]` Malli pattern becomes
  `(:kind string)` + `(:pattern …)` + `(:brand …)`. Additional refinement
  predicates would be `(:refine predicate-expr)` but are not used here.
- Malli's `[:maybe T]` is `(Optional T)`, a constructor in the schema
  algebra.
- Namespaced keys `:employee/id` don't appear in the schema; they're the
  triple-store convention and emerge from the `(:identifier "Employee")`
  prefix at translator time. In the Effect-TS reference translator the
  schema is emitted with flat field names.

## 2. Errors

### Clojure (Cognitect anomalies)

```clojure
;; Errors are categorized maps.
{:cognitect.anomalies/category :not-found
 :employee/id ...}
```

### Open Ontology Lisp

```lisp
(define-error EmployeeNotFound
  (:fields (field employee-id EmployeeId))
  (:status 404))

(define-error BadRequest
  (:fields (field reason String))
  (:status 400))

(define-error InternalError
  (:fields (field trace-id String))
  (:status 500))
```

**Translation notes.**

- Cognitect anomalies are a runtime convention; `define-error` is a typed
  schema plus HTTP status annotation plus tagged constructor. The TS
  translator lowers each one to `Schema.TaggedError<…>()(tag, fields,
HttpApiSchema.annotations({status}))`.
- The Clojure story relies on middleware at the edge converting caught
  exceptions to anomaly maps. The OO Lisp story is compile-time: every
  endpoint enumerates its reachable errors via `:errors`, and the
  handler's raises are checked against that set by the elaboration-time
  substrate.

## 3. Routes + Endpoints

### Clojure (Reitit)

```clojure
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

### Open Ontology Lisp

```lisp
(define-api-group employees
  (endpoint list
    (:method  GET)
    (:path    "/employees")
    (:query
      (field page                 (Optional Int))
      (field per-page             (Optional Int))
      (field order-by             (Optional String))
      (field order-dir            (Optional String))
      (field employee-id          (Optional EmployeeId))
      (field first-name           (Optional String))
      (field last-name            (Optional String))
      (field email                (Optional String))
      (field status               (Optional EmployeeStatus))
      (field custom-view-id       (Optional String))
      (field progress-min         (Optional Float))
      (field progress-max         (Optional Float)))
    (:success EmployeeList)
    (:errors  BadRequest InternalError))

  (endpoint migrate-progress
    (:method  PATCH)
    (:path    "/employees/migrate_progress")
    (:query
      (field source-employee-id EmployeeId)
      (field target-employee-id EmployeeId))
    (:success Unit)
    (:errors  EmployeeNotFound BadRequest InternalError)))
```

**Translation notes.**

- Reitit's data-tree routing maps cleanly to nested `define-api-group` +
  `endpoint` forms. Both are walkable by a tree consumer.
- Reitit has Swagger/OpenAPI generation built in; OO Lisp produces
  descriptors from the IR for every translator target.
- Reitit middleware attaches at the route-data level. The current OO
  HTTP API spec reserves a `define-middleware` form for future work; for
  now, middleware wiring lives in the runtime translator.
- Reitit's `:parameters {:query …}` is the same shape as OO Lisp's
  `:query (field …)`.

## 4. Handler

### Clojure

```clojure
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

### Open Ontology Lisp

```lisp
(define-handler-group employees
  (:api      employees)
  (:requires EmployeeModel CustomViewModel Account)

  (handle list [{:keys [query]}]
    (let [filters         (build-filters query)
          account-id      (account/current-id!)
          {:keys [ids total]} (employee-model/paginated-ids!
                                {:account-id account-id
                                 :filters    filters
                                 :order-by   (:order-by query)
                                 :order-dir  (:order-dir query)
                                 :page       (:page query)
                                 :per-page   (:per-page query)})
          rows            (employee-model/hydrate! {:ids ids})
          sorted          (sort-by-ids rows ids)
          per-page        (:per-page query)]
      {:total        total
       :current-page (:page query)
       :per-page     per-page
       :total-pages  (ceil (/ total per-page))
       :data         (map employee->public sorted)}))

  (handle migrate-progress [{:keys [query]}]
    (employee-model/migrate-progress!
      {:source (:source-employee-id query)
       :target (:target-employee-id query)})
    {}))

(define-fn build-filters [query]
  (let [view-filters (when (:custom-view-id query)
                       (custom-view-model/filters-by-uid!
                         {:uid (:custom-view-id query)}))
        request-filters (select-keys query
                          [:employee-id :first-name :last-name
                           :email :status :progress-min :progress-max])]
    (concat (when view-filters [view-filters])
            (when (some some? (vals request-filters)) [request-filters]))))
```

**Translation notes.**

- `db`, `account`, and other services enter the Clojure handler through
  the request map (enriched by middleware). In OO Lisp the services enter
  through the `:requires` capability list — resolved at elaboration time
  under
  [`specs/language/elaboration-time-handlers.md`](./research/elaboration-time-handlers.md),
  so `employee-model/paginated-ids!` desugars to a direct call on the
  resolved `EmployeeModel` capability's `paginated-ids` operation.
- The `!`-suffix on every capability call is the one syntactic marker of
  effectful calls. Pure helpers (`build-filters`, `sort-by-ids`,
  `employee->public`) stay suffix-free.
- The Clojure handler's error path is `throw` + middleware recovery. The
  OO handler's error path is `(raise! (BadRequest {:reason "…"}))`, and
  elaboration checks that every raise is covered by the endpoint's
  `:errors`.

## 5. Query Layer — Relational

### Clojure (HoneySQL)

```clojure
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
```

### Open Ontology Lisp (speculative — using existing Datalog surface)

Open Ontology's triple store owns this layer. The pagination is a single
Datalog query, not a composed SQL tree. The existing Datalog surface
(see `CLAUDE.md`, "Datalog Queries") is JSON today; here it is written
in the Lisp surface consistent with the ontology preludes:

```lisp
(define-query paginated-employee-ids
  (:params
    (param account-id AccountId)
    (param page       Int)
    (param per-page   Int))
  (:find    [?e ?total])
  (:with
    (aggregate ?total (count-distinct ?e)))
  (:where
    [?e :employee/account     ?account-id]
    [?e :employee/deleted-at  nil])
  (:order-by [(created-at ?e) :desc])
  (:limit    ?per-page)
  (:offset   (* (- ?page 1) ?per-page)))
```

Filters compose the same way Clojure's `apply-filter-block` does — as
data added to the `:where` clause. With the Lisp DSL, filter composition
is handled by a helper form:

```lisp
(define-fn apply-filter-block [query block]
  (reduce-kv
    (fn [q k v]
      (case k
        :first-name   (query/add-where q [?e :employee/first-name ?fn]
                                         [(includes? ?fn v)])
        :status       (query/add-where q [?e :employee/status v])
        :progress-min (query/add-where q [?e :employee/overall-task-progress ?p]
                                         [(>= ?p v)])
        :progress-max (query/add-where q [?e :employee/overall-task-progress ?p]
                                         [(<= ?p v)])
        q))
    query block))
```

**Translation notes.**

- The CTE + computed-metrics aggregation in the SQL version becomes
  native Datalog aggregation (`count-distinct`, `avg`, `max`) on
  triple-store facts.
- Bitemporal "as of" queries are free — the triple store already
  timestamps every fact, so compliance-style audit queries on historical
  employee state are supported without additional infrastructure.
- The `define-query` form itself is elaborated by the ontology preludes
  (see `preludes/ontology.lisp`), so the query body participates in
  elaboration-time schema checking (`:employee/first-name` must be a
  declared attribute, etc.).

## 6. Server Wiring

### Clojure (Integrant)

```clojure
(defn app [{:keys [db redis jwt]}]
  (ring/ring-handler
    (ring/router
      [["/api/internal"
        {:middleware [(mw/inject-deps {:db db :redis redis :jwt jwt})
                      mw/auth-context]}
        employees/routes
        clients/routes]]
      {:data {:coercion rcm/coercion
              :middleware [...]}})))

;; Integrant config:
{:onboarded/db     {:url (env :db-url)}
 :onboarded/redis  {:url (env :redis-url)}
 :onboarded/jwt    {:secret (env :jwt-secret)}
 :onboarded/app    {:db    #ig/ref :onboarded/db
                    :redis #ig/ref :onboarded/redis
                    :jwt   #ig/ref :onboarded/jwt}}
```

### Open Ontology Lisp (speculative — using capabilities)

```lisp
(define-capability EmployeeModel
  (:ops
    (:employee-model/paginated-ids    (Fn PaginationInput  -> PaginationResult))
    (:employee-model/hydrate          (Fn HydrateInput     -> (Array Employee)))
    (:employee-model/migrate-progress (Fn MigrateInput     -> Unit))))

(define-capability CustomViewModel
  (:ops
    (:custom-view-model/filters-by-uid (Fn FiltersInput -> FilterMap))))

(define-capability Account
  (:ops
    (:account/current-id (Fn Unit -> AccountId))))

;; Deployment form — the capability record is constructed at deploy time
;; by the runtime translator and injected into the handler group:
(define-deployment onboarded-internal
  (:api      employees)
  (:handlers employees)
  (:bindings
    (bind EmployeeModel     employee-model-postgres-impl)
    (bind CustomViewModel   custom-view-model-postgres-impl)
    (bind Account           account-from-jwt-impl)))
```

**Translation notes.**

- Integrant's dependency maps (`{:db #ig/ref :onboarded/db}`) map one-to-one
  onto OO Lisp's `define-deployment` bindings. Both are pure data.
- Integrant's `:init-key` / `:halt-key` lifecycle hooks are equivalent to
  capability records that expose `:start` / `:stop` operations. The
  runtime translator's job is to call them in dependency order.
- No Effect `Layer.provide(...)` chain on either side: dependencies are
  declarative.

## 7. Client State

### Clojure (re-frame)

```clojure
(rf/reg-event-fx ::fetch
  (fn [{:keys [db]} [_ params]]
    {:db (assoc-in db [:employees :loading?] true)
     :fx [[:api/get {:path     "/api/internal/employees"
                     :query    params
                     :on-success [::fetch-success]
                     :on-failure [::fetch-failure]}]]}))

(rf/reg-sub ::list (fn [db] (get-in db [:employees :data] [])))
```

### Open Ontology (current TS surface)

Open Ontology's client state lives in `effect-atom` today (see
`packages/web/app/*/state.ts`). The canonical pattern mirrors re-frame:
a single atom store, events describe intent, subscriptions are reactive
views. The Lisp DSL does not yet cover the client side; `define-atom`,
`define-event`, `define-subscription` are plausible future forms that
would elaborate to effect-atom bindings.

Speculative shape:

```lisp
(define-atom employees
  (:schema EmployeeList)
  (:initial {:total 0 :data []}))

(define-event fetch-employees
  (:params
    (param page     Int)
    (param per-page Int))
  (:performs
    (api/get! {:path   "/api/internal/employees"
               :query  {:page page :per-page per-page}})
    (set-atom! employees)))

(define-subscription employees-list
  (:from employees)
  (:returns (Array Employee))
  (:body (:data state)))
```

**Translation notes.**

- The same single-source-of-truth discipline is possible because
  `effect-atom` enforces it today. Lifting it into a DSL gives us typed
  state shape + compiler-enforced event coverage.
- Out of scope for the current HTTP API authoring spec; noted here as a
  natural extension once the HTTP DSL lands.

## Summary

| Layer              | Clojure                   | Open Ontology Lisp                             |
| ------------------ | ------------------------- | ---------------------------------------------- |
| Schema             | Malli maps                | `define-schema` + schema algebra               |
| Errors             | Cognitect anomaly maps    | `define-error` + typed `:errors` sets          |
| Routes             | Reitit data-tree          | `define-api-group` + `endpoint` forms          |
| Handler            | Plain `defn`              | `define-handler-group` + `!`-suffixed ops      |
| Query (relational) | HoneySQL composition      | `define-query` over triple-store Datalog       |
| Server wiring      | Integrant dependency maps | `define-capability` + `define-deployment`      |
| Client state       | re-frame events + subs    | `effect-atom` (TS today; `define-atom` future) |

Both stacks share the same governing instinct: **prefer data, walk it
with functions, reach for macros last.** They diverge on two points that
matter:

1. **Static vs. dynamic contracts.** Open Ontology's Lisp is elaborated
   by a compiler pass before any code runs. Missing capabilities,
   uncovered errors, and unknown path params are diagnostics; Clojure
   catches these at test time if at all.
2. **Portable IR.** Open Ontology's Lisp targets a backend-neutral IR
   that can produce TS, Rust, Go, or Python server implementations from
   one source. Clojure is its own deployment target.

The Clojure sketch arrives at the data-first shape by convention. The OO
Lisp sketch arrives at it by structure — the `define-form` / `meta-fn`
machinery enforces the shape. Both are legitimate; the tradeoff is
ceremony-for-guarantees versus convention-for-reach.
