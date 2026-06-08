; ui.lisp
; -----------------------------------------------------------------------------
; Hosted UI prelude for domain-neutral ViewSpec component forms.
;
; This file intentionally contains no domain vocabulary. ViewSpec forms live in
; viewspec.lisp and are loaded after this file so they inherit the same hosted
; DSL symbol table.
; -----------------------------------------------------------------------------

(define-form text
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)
      (:positional-prop content)))
  (:slots
    (slot content expr (:alias text))))

(define-form rows
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot gap value (:type Number))))

(define-form columns
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot gap value (:type Number))))

(define-form card
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true)
        (:node-slots [action footer]))))
  (:slots
    (slot title expr)
    (slot description expr)
    (slot subject-mode expr)
    (slot action form (:many true))
    (slot footer form (:many true))))

(define-form item-group
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children any)
      (:compile
        (:required-children true)))))

(define-form item
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:events {:on-click onClick})))
  (:slots
    (slot variant value (:type String))
    (slot size value (:type String))
    (slot icon value (:type String))
    (slot title expr (:alias text) (:alias content))
    (slot description expr)
    (slot value expr)
    (slot badge expr)
    (slot badge-variant value (:type String)))
  (:validation
    (validate validate-one-of (:slot variant) (:values [default outline muted]))
    (validate validate-one-of (:slot size) (:values [default sm xs]))
    (validate validate-one-of
      (:slot badge-variant)
      (:values [default secondary outline destructive]))))

(define-form button
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible disabled]))
      (:children any)
      (:events {:on-click onClick})
      (:positional-prop label)))
  (:slots
    (slot label expr (:alias text) (:alias title) (:alias content))
    (slot variant value (:type String))
    (slot size value (:type String))
    (slot disabled expr)
    (slot button-type value (:type String) (:alias type)))
  (:validation
    (validate validate-one-of
      (:slot variant)
      (:values [default destructive outline secondary ghost link]))
    (validate validate-one-of (:slot size) (:values [default sm lg icon]))
    (validate validate-one-of (:slot button-type) (:values [button submit reset]))))

(define-form progress
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)))
  (:slots
    (slot value expr)
    (slot label expr (:alias title))
    (slot hint expr (:alias description))))

(define-form workflow-strip
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:children only [workflow-step])
      (:compile
        (:required-children true))))
  (:slots
    (slot title expr)
    (slot description expr)))

(define-form workflow-step
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:children none)
      (:parents [workflow-strip])))
  (:slots
    (slot label expr (:required true) (:alias title))
    (slot description expr)
    (slot status expr)
    (slot icon value (:type String))))

(define-form empty-state
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)))
  (:slots
    (slot icon value (:type String))
    (slot title expr (:alias text) (:alias content))
    (slot description expr)))

(define-form badge
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop content)))
  (:slots
    (slot content expr (:alias text) (:alias label) (:alias value))
    (slot variant value (:type String))
    (slot dot value (:type Boolean))
    (slot dot-color value (:type String)))
  (:validation
    (validate validate-one-of
      (:slot variant)
      (:values [default secondary outline destructive]))))

(define-form avatar
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)))
  (:slots
    (slot src expr)
    (slot alt expr)
    (slot fallback expr (:alias text) (:alias label))
    (slot size value (:type String)))
  (:validation
    (validate validate-one-of (:slot size) (:values [default sm lg]))))

(define-form kbd
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop content)))
  (:slots
    (slot content expr (:alias text) (:alias label))))

(define-form spinner
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)))
  (:slots
    (slot label expr)
    (slot size value (:type String)))
  (:validation
    (validate validate-one-of (:slot size) (:values [sm default lg]))))

(define-form separator
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)))
  (:slots
    (slot orientation value (:type String)))
  (:validation
    (validate validate-one-of
      (:slot orientation)
      (:values [horizontal vertical]))))

(define-form tabs
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children only [tab-panel])
      (:compile
        (:required-children true)))))

(define-form tab-panel
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:parents [tabs])
      (:compile
        (:required-children true)
        (:extra-fields [
          {:name title :optional true :ts ViewExpr :schema ViewExpression}
        ])
        (:extra-normalize-fields [
          {:field title :keys [title label] :kind expr}
        ]))))
  (:slots
    (slot label expr (:alias title))))

(define-form accordion
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children only [accordion-item])
      (:compile
        (:required-children true))))
  (:slots
    (slot mode value (:type String)))
  (:validation
    (validate validate-one-of (:slot mode) (:values [single multiple]))))

(define-form accordion-item
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:parents [accordion])
      (:compile
        (:required-children true))))
  (:slots
    (slot title expr (:alias label) (:alias text))
    (slot default-open value (:type Boolean))))

(define-form grid
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot columns value (:type Number))))

(define-form aspect-ratio
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot ratio value (:type Number))))

(define-form spacer
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)))
  (:slots
    (slot height value (:type Number))))

(define-form split-pane
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true)
        (:slot-normalize-kinds {:sizes number-array})
        (:slot-types
          {:sizes {:kind array :item number}}))))
  (:slots
    (slot direction value (:type String))
    (slot sizes value (:type Array)))
  (:validation
    (validate validate-one-of
      (:slot direction)
      (:values [horizontal vertical]))))

(define-form for-each
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children any)
      (:compile
        (:required-children true)
        (:required-bind true))))
  (:slots
    (slot empty-text value (:type String))))

(define-form condition
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children only [case else])
      (:compile
        (:required-children true)))))

(define-form case
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:parents [condition])
      (:compile
        (:required-children true)
        (:slot-defaults {:when false-expr-or-bind}))))
  (:slots
    (slot when expr (:required true) (:type Bool))))

(define-form else
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:parents [condition])
      (:compile
        (:required-children true)))))

(define-form slot
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children any)
      (:positional-prop name)))
  (:slots
    (slot name value (:type String) (:alias ref))))

(define-form use
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:positional-prop name)))
  (:slots
    (slot name value (:type String) (:required true) (:alias ref) (:alias def))
    (slot overrides value (:type Object) (:alias params))))

(define-form tooltip
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot content expr (:required true) (:alias text) (:alias label))
    (slot side value (:type String)))
  (:validation
    (validate validate-one-of (:slot side) (:values [top right bottom left]))))

(define-form popover
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true)
        (:node-slots [trigger]))))
  (:slots
    (slot trigger form (:many true) (:required true))
    (slot title expr)
    (slot description expr)
    (slot side value (:type String))
    (slot align value (:type String)))
  (:validation
    (validate validate-one-of (:slot side) (:values [top right bottom left]))
    (validate validate-one-of (:slot align) (:values [start center end]))))

(define-form hover-card
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true)
        (:node-slots [trigger]))))
  (:slots
    (slot trigger form (:many true) (:required true))
    (slot side value (:type String))
    (slot align value (:type String)))
  (:validation
    (validate validate-one-of (:slot side) (:values [top right bottom left]))
    (validate validate-one-of (:slot align) (:values [start center end]))))

(define-form dialog
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:events {:on-open-change onOpenChange})
      (:compile
        (:required-children true))))
  (:slots
    (slot dialog-id value (:type String) (:required true) (:alias id) (:alias name))
    (slot title expr)
    (slot description expr)))

(define-form table
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)
      (:events {:on-row-click onRowClick})
      (:compile
        (:required-bind true)
        (:slot-normalize-kinds
          {:columns table-columns
           :filters table-filters
           :default-sort table-sort})
        (:slot-types
          {:columns {:kind array :item [string ViewTableColumn]}
           :filters {:kind array :item [string ViewTableFilter]}
           :default-sort ViewTableSort}))))
  (:slots
    (slot columns value (:type Array))
    (slot filters value (:type Array))
    (slot page-size value (:type Number))
    (slot default-sort value (:type Object))
    (slot empty-state value (:type String))))

(define-form tree
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children any)
      (:events {:on-node-click onNodeClick})
      (:compile
        (:slot-normalize-kinds {:default-expanded boolean-or-number})
        (:slot-types
          {:default-expanded [boolean number]}))))
  (:slots
    (slot id-key value (:type String))
    (slot parent-id-key value (:type String) (:alias parent-key))
    (slot label-key value (:type String))
    (slot default-expanded value (:type Any))))

(define-form metric
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)
      (:compile
        (:required-bind true)
        (:slot-normalize-kinds {:series chart-series}))))
  (:slots
    (slot label expr (:alias title))
    (slot value expr)
    (slot value-key value (:type String))))

(define-form chart
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)
      (:compile
        (:slot-types
          {:series {:kind array :item [string ViewChartSeries]}}))))
  (:slots
    (slot title expr)
    (slot chart-type value (:type String) (:alias variant))
    (slot category-key value (:type String) (:alias x-key))
    (slot series value (:type Array)))
  (:validation
    (validate validate-one-of
      (:slot chart-type)
      (:values [bar line area pie radar radial scatter]))))

(define-form markdown
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:compile
        (:expr-props [visible bind]))
      (:children none)
      (:positional-prop content)))
  (:slots
    (slot content expr)))

(define-form stat-group
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot gap value (:type Number))))

(define-form heading
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop text)))
  (:slots
    (slot text expr (:alias title) (:alias content))
    (slot level value (:type Number))))

(define-form divider
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none))))

(define-form alert
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop message)
      (:compile
        (:slot-defaults {:message empty-expr}))))
  (:slots
    (slot variant value (:type String))
    (slot message expr (:required true) (:alias text)))
  (:validation
    (validate validate-one-of (:slot variant) (:values [default warning error info]))))

(define-form form
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:events {:on-submit onSubmit})
      (:compile
        (:required-children true))))
  (:slots
    (slot title expr)
    (slot description expr)))

(define-form button-group
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:required-children true))))
  (:slots
    (slot orientation value (:type String)))
  (:validation
    (validate validate-one-of (:slot orientation) (:values [horizontal vertical]))))

(define-form breadcrumb
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children only [breadcrumb-item])
      (:compile
        (:required-children true)))))

(define-form breadcrumb-item
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:parents [breadcrumb])
      (:events {:on-click onClick})))
  (:slots
    (slot label expr (:required true) (:alias text) (:alias title))
    (slot href expr)
    (slot current value (:type Boolean))))

(define-form input
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
    (slot default-value expr)
    (slot label expr)
    (slot description expr)
    (slot placeholder value (:type String))
    (slot input-type value (:type String) (:alias type))
    (slot prefix value (:type String))
    (slot suffix value (:type String)))
  (:validation
    (validate validate-one-of
      (:slot input-type)
      (:values [text email password number url date]))))

(define-form textarea
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
    (slot default-value expr)
    (slot label expr)
    (slot description expr)
    (slot placeholder value (:type String))))

(define-form checkbox
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
    (slot default-value expr)
    (slot label expr (:alias text) (:alias title))
    (slot description expr)))

(define-form switch
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
    (slot default-value expr)
    (slot label expr (:alias text) (:alias title))
    (slot description expr)))

(define-form select
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children only [select-option])
      (:events {:on-change onChange})
      (:compile
        (:slot-normalize-kinds {:options select-options})
        (:slot-types
          {:options {:kind array :item [string ViewSelectOptionValue]}}))))
  (:slots
    (slot name value (:type String) (:required true) (:alias state-key) (:alias key))
    (slot default-value expr)
    (slot label expr)
    (slot description expr)
    (slot placeholder value (:type String))
    (slot options value (:type Array))))

(define-form select-option
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:parents [select])
      (:compile
        (:extra-normalize-fields [
          {:field label :keys [label text value] :kind expr}
        ]))))
  (:slots
    (slot value value (:type String) (:required true) (:alias key))
    (slot label expr (:alias text))))

(define-form radio-group
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children only [radio-option])
      (:events {:on-change onChange})
      (:compile
        (:slot-normalize-kinds {:options select-options})
        (:slot-types
          {:options {:kind array :item [string ViewSelectOptionValue]}}))))
  (:slots
    (slot name value (:type String) (:required true) (:alias state-key) (:alias key))
    (slot default-value expr)
    (slot label expr)
    (slot description expr)
    (slot options value (:type Array))))

(define-form radio-option
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:parents [radio-group])
      (:compile
        (:extra-normalize-fields [
          {:field label :keys [label text value] :kind expr}
        ]))))
  (:slots
    (slot value value (:type String) (:required true) (:alias key))
    (slot label expr (:alias text))))

(define-form slider
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:events {:on-change onChange})
      (:compile
        (:slot-normalize-kinds {:options select-options}))))
  (:slots
    (slot name value (:type String) (:required true) (:alias state-key) (:alias key))
    (slot default-value expr)
    (slot label expr)
    (slot description expr)
    (slot min value (:type Number))
    (slot max value (:type Number))
    (slot step value (:type Number))))

(define-form toggle-group
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:events {:on-change onChange})
      (:compile
        (:slot-types
          {:options {:kind array :item [string ViewSelectOptionValue]}}))))
  (:slots
    (slot name value (:type String) (:required true) (:alias state-key) (:alias key))
    (slot default-value expr)
    (slot mode value (:type String))
    (slot variant value (:type String))
    (slot options value (:type Array)))
  (:validation
    (validate validate-one-of (:slot mode) (:values [single multiple]))
    (validate validate-one-of (:slot variant) (:values [default outline]))))

(define-form skeleton
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)))
  (:slots
    (slot lines value (:type Number))))

(define-form raw-html
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop content)))
  (:slots
    (slot content expr (:required true) (:alias html))))

(define-form raw-css
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop content)))
  (:slots
    (slot content expr (:required true) (:alias css))))

(define-form raw-js
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children none)
      (:positional-prop code)))
  (:slots
    (slot code expr (:required true) (:alias js) (:alias content))))

(define-form custom
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:compile
        (:expr-props [visible]))
      (:children any)
      (:compile
        (:json-slots [props])
        (:unknown-props json)
        (:slot-types
          {:props {:kind record :value unknown}}))))
  (:slots
    (slot component-name value (:type String) (:required true))
    (slot props value (:type Object))))

(define-form component-ref
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "component-ref")
      (:to "view-ref"))))

(define-form cond
  (:phase meta)
  (:extensions
    (:view/layout-alias
      (:form "cond")
      (:to "condition"))))
