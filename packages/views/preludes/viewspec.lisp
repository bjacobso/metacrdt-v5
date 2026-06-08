; viewspec.lisp
; -----------------------------------------------------------------------------
; Hosted ViewSpec prelude for ontology-aware UI forms.
;
; Domain-neutral primitives live in ui.lisp. This file contains only forms and
; aliases whose meaning depends on ontology/runtime concepts.
; -----------------------------------------------------------------------------

(define-form entity-browser
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)
      (:events {:on-row-click onRowClick})))
  (:slots
    (slot title expr)))

(define-form action-button
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:events {:on-click onClick :on-success onSuccess})
      (:compile
        (:json-slots [parameters])
        (:slot-types
          {:parameters {:kind record :value unknown}}))))
  (:slots
    (slot label expr (:alias text))
    (slot variant value (:type String))
    (slot action-ref value (:type String) (:alias action-name))
    (slot entity-id expr (:alias entity-id-bind))
    (slot parameters value (:type Object)))
  (:validation
    (validate validate-one-of
      (:slot variant)
      (:values [default destructive outline secondary ghost]))))

(define-form create-entity-button
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:events {:on-click onClick :on-success onSuccess})))
  (:slots
    (slot label expr (:alias text))
    (slot entity-type value (:type String) (:required true) (:alias entity))
    (slot variant value (:type String)))
  (:validation
    (validate validate-one-of
      (:slot variant)
      (:values [default destructive outline secondary ghost]))))

(define-form entity-picker
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:events {:on-change onChange})))
  (:slots
    (slot name value (:type String) (:required true) (:alias state-key) (:alias key))
    (slot label expr)
    (slot description expr)
    (slot placeholder value (:type String))
    (slot entity-type value (:type String) (:alias entity))))

(define-form query-console
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)))
  (:slots
    (slot title expr)))

(define-form view-ref
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop name)
      (:compile
        (:json-slots [input])
        (:slot-types
          {:input {:kind record :value unknown}}))))
  (:slots
    (slot name value (:type String) (:required true) (:alias ref))
    (slot input value (:type Object))))

(define-form action-form
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "action-form")
      (:to "action-button"))))

(define-form entity-table
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "entity-table")
      (:component-name "runtime/entity-table"))))

(define-form entity-detail
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "entity-detail")
      (:component-name "runtime/entity-detail"))))

(define-form entity-form
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "entity-form")
      (:component-name "runtime/entity-form"))))

(define-form task-queue
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "task-queue")
      (:component-name "runtime/task-queue"))))

(define-form task-detail
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "task-detail")
      (:component-name "runtime/task-detail"))))

(define-form task-summary
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "task-summary")
      (:component-name "runtime/task-summary"))))

(define-form task-status-editor
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "task-status-editor")
      (:component-name "runtime/task-status-editor"))))

(define-form task-document-links
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "task-document-links")
      (:component-name "runtime/task-document-links"))))

(define-form task-metadata
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "task-metadata")
      (:component-name "runtime/task-metadata"))))

(define-form violation-list
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "violation-list")
      (:component-name "runtime/violation-list"))))

(define-form violation-detail
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "violation-detail")
      (:component-name "runtime/violation-detail"))))

(define-form violation-summary
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "violation-summary")
      (:component-name "runtime/violation-summary"))))

(define-form violation-status-editor
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "violation-status-editor")
      (:component-name "runtime/violation-status-editor"))))

(define-form violation-related-records
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "violation-related-records")
      (:component-name "runtime/violation-related-records"))))

(define-form violation-timeline
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "violation-timeline")
      (:component-name "runtime/violation-timeline"))))
