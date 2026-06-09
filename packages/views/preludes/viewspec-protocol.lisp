; viewspec-protocol.lisp
; -----------------------------------------------------------------------------
; Hosted ViewSpec protocol descriptors that are not component nodes.
; -----------------------------------------------------------------------------

(define-form view-protocol-registry
  (:phase meta)
  (:extensions
    (:protocol/registry
      (:compile-layout-tree-op view/compile-layout-tree)
      (:hosted-dsl-name "viewspec")
      (:allow-default-component-layout-args true)
      (:allow-hosted-dsl-name-layout-args true)
      (:component-prop-name-normalization camel-case)
      (:component-extension view/component)
      (:component-protocol-extension view/component-protocol)
      (:component-protocol-prop-name-normalization-field prop-name-normalization)
      (:component-protocol-type-field-field type-field)
      (:component-protocol-props-field-field props-field)
      (:component-protocol-events-field-field events-field)
      (:component-protocol-children-field-field children-field)
      (:component-protocol-bind-prop-field-field bind-prop)
      (:component-protocol-required-bind-value-field-field required-bind-value)
      (:component-protocol-scalar-fallback-field-field scalar-fallback-field)
      (:component-protocol-scalar-fallback-kind-field-field scalar-fallback-kind)
      (:component-protocol-unknown-props-field unknown-props)
      (:component-compile-field compile)
      (:component-children-policy-field children)
      (:component-parents-field parents)
      (:component-allows-bind-field allows-bind)
      (:component-json-slots-field json-slots)
      (:component-node-slots-field node-slots)
      (:component-expr-props-field expr-props)
      (:component-unknown-props-field unknown-props)
      (:component-required-children-field required-children)
      (:component-required-bind-field required-bind)
      (:component-field-overrides-field fields)
      (:component-event-overrides-field events)
      (:component-positional-prop-field positional-prop)
      (:component-events-field events)
      (:component-type-field-field type-field)
      (:component-events-section-field events-field)
      (:component-props-section-field props-field)
      (:component-children-section-field children-field)
      (:enum-extension protocol/enum)
      (:action-form-field form)
      (:action-discriminator-field-field discriminator-field)
      (:action-tag-field tag)
      (:action-callbacks-field callbacks)
      (:action-positional-field positional)
      (:action-keywords-field keywords)
      (:action-extension view/action)
      (:action-string-mechanism string)
      (:action-expr-mechanism expr)
      (:action-json-mechanism json)
      (:action-literal-mechanism literal)
      (:action-string-list-mechanism string-list)
      (:expr-op-form-field form)
      (:expr-op-lowering-field lowering)
      (:expr-op-name-field name)
      (:expr-op-operator-field op)
      (:expr-op-extension view/expr-op)
      (:expr-get-path-mechanism get-path)
      (:expr-pipe-call-mechanism pipe-call)
      (:expr-unary-mechanism unary)
      (:expr-binary-mechanism binary)
      (:expr-compare-nil-mechanism compare-nil)
      (:expr-conditional-mechanism conditional)
      (:expr-pipe-chain-mechanism pipe-chain)
      (:expr-literal-object-default-key value)
      (:expr-json-object-default-key value)
      (:expr-var-default-source "value")
      (:expr-kind-field kind)
      (:expr-literal-kind literal)
      (:expr-literal-value-field value)
      (:expr-var-kind var)
      (:expr-var-source-field source)
      (:expr-var-path-field path)
      (:expr-unary-kind unary)
      (:expr-unary-op-field op)
      (:expr-unary-value-field value)
      (:expr-binary-kind binary)
      (:expr-binary-op-field op)
      (:expr-binary-left-field left)
      (:expr-binary-right-field right)
      (:expr-conditional-kind conditional)
      (:expr-conditional-condition-field condition)
      (:expr-conditional-then-field then)
      (:expr-conditional-else-field else)
      (:expr-pipe-kind pipe)
      (:expr-pipe-name-field name)
      (:expr-pipe-value-field value)
      (:expr-pipe-args-field args)
      (:expr-compare-nil-operator "===")
      (:layout-alias-form-field form)
      (:layout-alias-to-field to)
      (:layout-alias-component-name-field component-name)
      (:layout-alias-component-name-prop-field component-name)
      (:layout-alias-extension view/layout-alias)
      (:layout-alias-default-to "custom")
      (:expr-source-extension view/expr-source)
      (:expr-source-sigils-field sigils)
      (:expr-source-enum ViewExprSource)
      (:action-field-kinds {
        string string
        expr expr
        json json
        literal literal
        string-list string-list
      })
      (:expr-op-lowerings {
        get-path get-path
        pipe-call pipe-call
        unary unary
        binary binary
        compare-nil compare-nil
        conditional conditional
        pipe-chain pipe-chain
      })
      (:slot-json-mechanism json)
      (:slot-value-mechanism value)
      (:slot-expr-mechanism expr)
      (:slot-node-list-mechanism node-list)
      (:slot-compile-kinds {
        json json
        value value
        expr expr
        node-list node-list
      })
      (:default-form-slot-kind node-list)
      (:default-value-slot-kind value)
      (:default-expr-slot-kind expr))))

(define-form view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:prop-name-normalization camel-case)
      (:type-field type)
      (:props-field props)
      (:events-field events)
      (:children-field children)
      (:bind-prop bind)
      (:required-bind-value [])
      (:scalar-fallback-field text)
      (:scalar-fallback-kind value)
      (:unknown-props json))))

(define-form view-expr-source
  (:phase meta)
  (:extensions
    (:protocol/enum
      (:name ViewExprSource)
      (:values [state query input row db item index event result error host])
      (:description "ViewSpec expression root source."))
    (:view/expr-source
      (:sigils [
        [$state state]
        [$query query]
        [$input input]
        [$row row]
        [$db db]
        [$item item]
        [$index index]
        [$event event]
        [$result result]
        [$error error]
        [$host host]
      ]))
    ))

(define-form view-expr-get
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form get)
      (:lowering get-path))))

(define-form view-expr-length-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form length)
      (:lowering pipe-call)
      (:name length))))

(define-form view-expr-not-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form not)
      (:lowering unary)
      (:op "!"))))

(define-form view-expr-nil-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form nil?)
      (:lowering compare-nil))))

(define-form view-expr-equals-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form "=")
      (:lowering binary)
      (:op "==="))))

(define-form view-expr-not-equals-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form "!=")
      (:lowering binary)
      (:op "!=="))))

(define-form view-expr-greater-than-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form ">")
      (:lowering binary)
      (:op ">"))))

(define-form view-expr-greater-than-or-equal-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form ">=")
      (:lowering binary)
      (:op ">="))))

(define-form view-expr-less-than-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form "<")
      (:lowering binary)
      (:op "<"))))

(define-form view-expr-less-than-or-equal-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form "<=")
      (:lowering binary)
      (:op "<="))))

(define-form view-expr-add-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form +)
      (:lowering binary)
      (:op "+"))))

(define-form view-expr-subtract-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form -)
      (:lowering binary)
      (:op "-"))))

(define-form view-expr-multiply-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form *)
      (:lowering binary)
      (:op "*"))))

(define-form view-expr-divide-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form /)
      (:lowering binary)
      (:op "/"))))

(define-form view-expr-and-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form and)
      (:lowering binary)
      (:op "&&"))))

(define-form view-expr-or-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form or)
      (:lowering binary)
      (:op "||"))))

(define-form view-expr-if-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form if)
      (:lowering conditional))))

(define-form view-expr-pipe-op
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form pipe)
      (:lowering pipe-chain))))

(define-form view-expr-literal
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewExprLiteral)
      (:fields
        (:kind (:kind literal) (:values [literal]) (:required true))
        (:value (:type unknown) (:required true))))))

(define-form view-expr-var
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewExprVar)
      (:fields
        (:kind (:kind literal) (:values [var]) (:required true))
        (:source (:type ViewExprSource) (:required true))
        (:path (:kind array) (:item string))))))

(define-form view-expr-binary
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewExprBinary)
      (:fields
        (:kind (:kind literal) (:values [binary]) (:required true))
        (:op
          (:kind literal)
          (:values ["===" "!==" ">" ">=" "<" "<=" "+" "-" "*" "/" "&&" "||"])
          (:required true))
        (:left (:type ViewExpr) (:required true))
        (:right (:type ViewExpr) (:required true))))))

(define-form view-expr-unary
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewExprUnary)
      (:fields
        (:kind (:kind literal) (:values [unary]) (:required true))
        (:op (:kind literal) (:values ["!" "-"]) (:required true))
        (:value (:type ViewExpr) (:required true))))))

(define-form view-expr-conditional
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewExprConditional)
      (:fields
        (:kind (:kind literal) (:values [conditional]) (:required true))
        (:condition (:type ViewExpr) (:required true))
        (:then (:type ViewExpr) (:required true))
        (:else (:type ViewExpr) (:required true))))))

(define-form view-expr-pipe
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewExprPipe)
      (:fields
        (:kind (:kind literal) (:values [pipe]) (:required true))
        (:name (:type string) (:required true))
        (:value (:type ViewExpr) (:required true))
        (:args (:kind array) (:item ViewExpr))))))

(define-form view-expr
  (:phase meta)
  (:extensions
    (:protocol/union
      (:name ViewExpr)
      (:schema-name ViewExpression)
      (:members
        (:literal (:ref ViewExprLiteral))
        (:var (:ref ViewExprVar))
        (:binary (:ref ViewExprBinary))
        (:unary (:ref ViewExprUnary))
        (:conditional (:ref ViewExprConditional))
        (:pipe (:ref ViewExprPipe))))))

(define-form view-expr-node
  (:phase meta)
  (:extensions
    (:protocol/type
      (:name ViewExprNode)
      (:type ViewExpr))))

(define-form view-expression-module
  (:phase meta)
  (:extensions
    (:protocol/module
      (:name ViewExpression)
      (:types [ViewExprNode])
      (:enums [ViewExprSource])
      (:objects [
        ViewExprLiteral
        ViewExprVar
        ViewExprBinary
        ViewExprUnary
        ViewExprConditional
        ViewExprPipe
      ])
      (:unions [ViewExpr]))))

(define-form view-set-state-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form set-state)
      (:discriminator-field action)
      (:tag setState)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[key string] [value expr]]))
    (:protocol/object
      (:name ViewSetStateAction)
      (:fields
        (:action (:kind literal) (:values [setState]) (:required true))
        (:key (:type string) (:required true))
        (:value (:type unknown) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-patch-state-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form patch-state)
      (:discriminator-field action)
      (:tag patchState)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[key string] [value expr]]))
    (:protocol/object
      (:name ViewPatchStateAction)
      (:fields
        (:action (:kind literal) (:values [patchState]) (:required true))
        (:key (:type string) (:required true))
        (:value (:type unknown) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-toggle-state-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form toggle-state)
      (:discriminator-field action)
      (:tag toggleState)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[key string]]))
    (:protocol/object
      (:name ViewToggleStateAction)
      (:fields
        (:action (:kind literal) (:values [toggleState]) (:required true))
        (:key (:type string) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-run-query-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form run-query)
      (:discriminator-field action)
      (:tag runQuery)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[query string]]))
    (:protocol/object
      (:name ViewRunQueryAction)
      (:fields
        (:action (:kind literal) (:values [runQuery]) (:required true))
        (:query (:type string) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-run-queries-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form run-queries)
      (:discriminator-field action)
      (:tag runQueries)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[queries string-list]]))
    (:protocol/object
      (:name ViewRunQueriesAction)
      (:fields
        (:action (:kind literal) (:values [runQueries]) (:required true))
        (:queries (:kind array) (:item string) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-navigate-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form navigate)
      (:discriminator-field action)
      (:tag navigate)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[path expr]]))
    (:protocol/object
      (:name ViewNavigateAction)
      (:fields
        (:action (:kind literal) (:values [navigate]) (:required true))
        (:path (:type ViewExpr) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-show-toast-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form show-toast)
      (:discriminator-field action)
      (:tag showToast)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[message expr]])
      (:keywords [[description description expr optional]
                  [variant variant literal optional]
                  [duration duration literal optional]]))
    (:protocol/object
      (:name ViewShowToastAction)
      (:fields
        (:action (:kind literal) (:values [showToast]) (:required true))
        (:message (:type ViewExpr) (:required true))
        (:description (:type ViewExpr))
        (:variant (:kind literal) (:values [default success error warning info]))
        (:duration (:type number))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-open-dialog-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form open-dialog)
      (:discriminator-field action)
      (:tag openDialog)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[dialogId string]]))
    (:protocol/object
      (:name ViewOpenDialogAction)
      (:fields
        (:action (:kind literal) (:values [openDialog]) (:required true))
        (:dialogId (:type string) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-close-dialog-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form close-dialog)
      (:discriminator-field action)
      (:tag closeDialog)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[dialogId string optional]]))
    (:protocol/object
      (:name ViewCloseDialogAction)
      (:fields
        (:action (:kind literal) (:values [closeDialog]) (:required true))
        (:dialogId (:type string))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-emit-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form emit)
      (:discriminator-field action)
      (:tag emit)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[event string] [payload expr optional]]))
    (:protocol/object
      (:name ViewEmitAction)
      (:fields
        (:action (:kind literal) (:values [emit]) (:required true))
        (:event (:type string) (:required true))
        (:payload (:type unknown))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-execute-action-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form execute-action)
      (:discriminator-field action)
      (:tag executeAction)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[actionRef string] [entityId expr optional]])
      (:keywords [[parameters parameters json optional]]))
    (:protocol/object
      (:name ViewExecuteActionAction)
      (:fields
        (:action (:kind literal) (:values [executeAction]) (:required true))
        (:actionRef (:type string) (:required true))
        (:entityId (:type ViewExpr))
        (:parameters (:kind record) (:value unknown))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-fetch-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form fetch)
      (:discriminator-field action)
      (:tag fetch)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[url expr]])
      (:keywords [[method method literal optional]
                  [headers headers json optional]
                  [body body json optional]]))
    (:protocol/object
      (:name ViewFetchAction)
      (:fields
        (:action (:kind literal) (:values [fetch]) (:required true))
        (:url (:type ViewExpr) (:required true))
        (:method (:kind literal) (:values [GET POST PUT PATCH DELETE]))
        (:headers (:kind record) (:value unknown))
        (:body (:type unknown))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-tool-call-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form tool-call)
      (:discriminator-field action)
      (:tag toolCall)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[tool expr]])
      (:keywords [[arguments arguments json optional]]))
    (:protocol/object
      (:name ViewToolCallAction)
      (:fields
        (:action (:kind literal) (:values [toolCall]) (:required true))
        (:tool (:type ViewExpr) (:required true))
        (:arguments (:kind record) (:value unknown))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-request-display-mode-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form request-display-mode)
      (:discriminator-field action)
      (:tag requestDisplayMode)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[mode literal]]))
    (:protocol/object
      (:name ViewRequestDisplayModeAction)
      (:fields
        (:action (:kind literal) (:values [requestDisplayMode]) (:required true))
        (:mode (:kind literal) (:values [inline fullscreen pip]) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-update-context-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form update-context)
      (:discriminator-field action)
      (:tag updateContext)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:keywords [[content content expr optional]
                  [structured-content structuredContent json optional]]))
    (:protocol/object
      (:name ViewUpdateContextAction)
      (:fields
        (:action (:kind literal) (:values [updateContext]) (:required true))
        (:content (:type ViewExpr))
        (:structuredContent (:kind record) (:value unknown))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-send-message-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form send-message)
      (:discriminator-field action)
      (:tag sendMessage)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:positional [[content expr]]))
    (:protocol/object
      (:name ViewSendMessageAction)
      (:fields
        (:action (:kind literal) (:values [sendMessage]) (:required true))
        (:content (:type ViewExpr) (:required true))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-open-file-picker-action
  (:phase meta)
  (:extensions
    (:view/action
      (:form open-file-picker)
      (:discriminator-field action)
      (:tag openFilePicker)
      (:callbacks [[on-success onSuccess] [on-error onError] [on-finally onFinally]])
      (:keywords [[accept accept literal optional]
                  [multiple multiple literal optional]
                  [max-size maxSize literal optional]]))
    (:protocol/object
      (:name ViewOpenFilePickerAction)
      (:fields
        (:action (:kind literal) (:values [openFilePicker]) (:required true))
        (:accept (:type string))
        (:multiple (:type boolean))
        (:maxSize (:type number))
        (:onSuccess (:type ViewActionOrList))
        (:onError (:type ViewActionOrList))
        (:onFinally (:type ViewActionOrList))))))

(define-form view-action
  (:phase meta)
  (:extensions
    (:protocol/union
      (:name ViewAction)
      (:schema-name ViewActionSchema)
      (:discriminator action)
      (:members
        (:setState (:tag setState) (:ref ViewSetStateAction))
        (:patchState (:tag patchState) (:ref ViewPatchStateAction))
        (:toggleState (:tag toggleState) (:ref ViewToggleStateAction))
        (:runQuery (:tag runQuery) (:ref ViewRunQueryAction))
        (:runQueries (:tag runQueries) (:ref ViewRunQueriesAction))
        (:navigate (:tag navigate) (:ref ViewNavigateAction))
        (:showToast (:tag showToast) (:ref ViewShowToastAction))
        (:openDialog (:tag openDialog) (:ref ViewOpenDialogAction))
        (:closeDialog (:tag closeDialog) (:ref ViewCloseDialogAction))
        (:emit (:tag emit) (:ref ViewEmitAction))
        (:executeAction (:tag executeAction) (:ref ViewExecuteActionAction))
        (:fetch (:tag fetch) (:ref ViewFetchAction))
        (:toolCall (:tag toolCall) (:ref ViewToolCallAction))
        (:requestDisplayMode (:tag requestDisplayMode) (:ref ViewRequestDisplayModeAction))
        (:updateContext (:tag updateContext) (:ref ViewUpdateContextAction))
        (:sendMessage (:tag sendMessage) (:ref ViewSendMessageAction))
        (:openFilePicker (:tag openFilePicker) (:ref ViewOpenFilePickerAction))))))

;; Event maps
(define-form view-click-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewClickEventMap)
      (:fields
        (:onClick (:type ViewActionOrList))))))

(define-form view-action-button-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewActionButtonEventMap)
      (:fields
        (:onClick (:type ViewActionOrList))
        (:onSuccess (:type ViewActionOrList))))))

(define-form view-row-click-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewRowClickEventMap)
      (:fields
        (:onRowClick (:type ViewActionOrList))))))

(define-form view-node-click-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewNodeClickEventMap)
      (:fields
        (:onNodeClick (:type ViewActionOrList))))))

(define-form view-change-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewChangeEventMap)
      (:fields
        (:onChange (:type ViewActionOrList))))))

(define-form view-submit-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewSubmitEventMap)
      (:fields
        (:onSubmit (:type ViewActionOrList))))))

(define-form view-open-change-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewOpenChangeEventMap)
      (:fields
        (:onOpenChange (:type ViewActionOrList))))))

(define-form view-event-map
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewEventMap)
      (:schema-name ViewEventMapSchema)
      (:fields
        (:onClick (:type ViewActionOrList))
        (:onSuccess (:type ViewActionOrList))
        (:onRowClick (:type ViewActionOrList))
        (:onNodeClick (:type ViewActionOrList))
        (:onChange (:type ViewActionOrList))
        (:onSubmit (:type ViewActionOrList))
        (:onOpenChange (:type ViewActionOrList))))))

;; State declarations
(define-form view-scalar-state-decl
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewScalarStateDecl)
      (:fields
        (:kind (:kind literal) (:values [string number boolean null]) (:required true))
        (:initial (:type unknown))))))

(define-form view-list-state-decl
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewListStateDecl)
      (:fields
        (:kind (:kind literal) (:values [list]) (:required true))
        (:item (:type ViewStateDecl))
        (:initial (:kind array) (:item unknown))))))

(define-form view-object-state-decl
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewObjectStateDecl)
      (:fields
        (:kind (:kind literal) (:values [object]) (:required true))
        (:fields (:kind record) (:value ViewStateDecl))
        (:initial (:kind record) (:value unknown))))))

(define-form view-json-state-decl
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewJsonStateDecl)
      (:fields
        (:kind (:kind literal) (:values [json]) (:required true))
        (:initial (:type unknown))))))

(define-form view-component-state-decl
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewComponentStateDecl)
      (:fields
        (:kind (:kind literal) (:values [component]) (:required true))
        (:initial (:kind union) (:variants [ViewNode Null]))))))

(define-form view-state-decl
  (:phase meta)
  (:extensions
    (:protocol/union
      (:name ViewStateDecl)
      (:schema-name ViewStateDeclSchema)
      (:discriminator kind)
      (:members
        (:scalar (:tag scalar) (:ref ViewScalarStateDecl))
        (:list (:tag list) (:ref ViewListStateDecl))
        (:object (:tag object) (:ref ViewObjectStateDecl))
        (:json (:tag json) (:ref ViewJsonStateDecl))
        (:component (:tag component) (:ref ViewComponentStateDecl))))))

;; View node support values
(define-form view-table-column
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewTableColumn)
      (:fields
        (:key (:type string) (:required true))
        (:label (:type string))
        (:kind (:kind literal) (:values [text status severity priority date mono]))))))

(define-form view-table-filter
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewTableFilter)
      (:fields
        (:key (:type string) (:required true))
        (:label (:type string))
        (:placeholder (:type string))
        (:op (:kind literal) (:values [ilike like "=" "!=" ">" ">=" "<" "<="]))))))

(define-form view-table-sort
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewTableSort)
      (:fields
        (:key (:type string) (:required true))
        (:direction (:kind literal) (:values [asc desc]))))))

(define-form view-chart-series
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewChartSeries)
      (:fields
        (:dataKey (:type string) (:required true))
        (:label (:type string))
        (:color (:type string))))))

(define-form view-select-option-value
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewSelectOptionValue)
      (:fields
        (:value (:type string) (:required true))
        (:label (:type string))))))

;; ViewSpec envelope
(define-form view-query-inline-binding
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewQueryInlineBinding)
      (:fields
        (:query (:type unknown) (:required true))
        (:params (:kind record) (:value unknown))
        (:dependsOn (:kind array) (:item string))))))

(define-form view-query-ref-binding
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewQueryRefBinding)
      (:fields
        (:queryRef (:type string) (:required true))
        (:params (:kind record) (:value unknown))
        (:dependsOn (:kind array) (:item string))))))

(define-form view-query-binding
  (:phase meta)
  (:extensions
    (:protocol/union
      (:name ViewQueryBinding)
      (:schema-name ViewQueryBinding)
      (:members
        (:inline (:ref ViewQueryInlineBinding))
        (:ref (:ref ViewQueryRefBinding))))))

(define-form view-input-param
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewInputParam)
      (:schema-name ViewInputParam)
      (:fields
        (:type (:type string) (:required true))
        (:description (:type string))
        (:default (:type unknown))))))

(define-form view-theme
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewTheme)
      (:schema-name ViewTheme)
      (:fields
        (:background (:type string))
        (:foreground (:type string))
        (:accent (:type string))
        (:accentForeground (:type string))
        (:muted (:type string))
        (:border (:type string))
        (:fontFamily (:type string))))))

(define-form view-capabilities
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewCapabilities)
      (:schema-name ViewCapabilities)
      (:fields
        (:toolCall (:type boolean))
        (:filePicker (:type boolean))
        (:displayMode (:type boolean))
        (:fetch (:type boolean))
        (:sendMessage (:type boolean))
        (:updateContext (:type boolean))))))

(define-form view-spec-marker
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewSpecMarker)
      (:fields
        (:version (:kind literal) (:values ["2"]) (:required true))))))

(define-form view-spec
  (:phase meta)
  (:extensions
    (:protocol/object
      (:name ViewSpec)
      (:schema-name ViewSpec)
      (:fields
        (:$viewSpec (:type ViewSpecMarker))
        (:description (:type string))
        (:input (:kind record) (:value ViewInputParam))
        (:state (:kind record) (:value ViewStateDecl))
        (:queries (:kind record) (:value ViewQueryBinding))
        (:defs (:kind record) (:value ViewNode))
        (:theme (:type ViewTheme))
        (:capabilities (:type ViewCapabilities))
        (:onMount (:type ViewActionOrList))
        (:keyBindings (:kind record) (:value ViewActionOrList))
        (:root (:type ViewNode) (:required true))))))

(define-form view-action-or-list
  (:phase meta)
  (:extensions
    (:protocol/type
      (:name ViewActionOrList)
      (:description "A single action or an ordered list of actions.")
      (:type (:kind union) (:variants [ViewAction {:array ViewAction}])))))

(define-form view-action-module
  (:phase meta)
  (:extensions
    (:protocol/module
      (:name ViewAction)
      (:imports [
        [ViewExpr from ViewExpression ViewExpression]
      ])
      (:types [ViewActionOrList])
      (:objects [
        ViewSetStateAction
        ViewPatchStateAction
        ViewToggleStateAction
        ViewRunQueryAction
        ViewRunQueriesAction
        ViewNavigateAction
        ViewShowToastAction
        ViewOpenDialogAction
        ViewCloseDialogAction
        ViewEmitAction
        ViewExecuteActionAction
        ViewFetchAction
        ViewToolCallAction
        ViewRequestDisplayModeAction
        ViewUpdateContextAction
        ViewSendMessageAction
        ViewOpenFilePickerAction
      ])
      (:unions [ViewAction]))))

(define-form view-event-module
  (:phase meta)
  (:extensions
    (:protocol/module
      (:name ViewEvent)
      (:imports [
        [ViewActionOrList from ViewAction ViewActionOrListSchema]
      ])
      (:objects [
        ViewClickEventMap
        ViewActionButtonEventMap
        ViewRowClickEventMap
        ViewNodeClickEventMap
        ViewChangeEventMap
        ViewSubmitEventMap
        ViewOpenChangeEventMap
        ViewEventMap
      ]))))

(define-form view-state-module
  (:phase meta)
  (:extensions
    (:protocol/module
      (:name ViewState)
      (:imports [
        [ViewNode from ViewNode ViewNode]
      ])
      (:objects [
        ViewScalarStateDecl
        ViewListStateDecl
        ViewObjectStateDecl
        ViewJsonStateDecl
        ViewComponentStateDecl
      ])
      (:unions [ViewStateDecl]))))

(define-form view-node-support-module
  (:phase meta)
  (:extensions
    (:protocol/module
      (:name ViewNodeSupport)
      (:objects [
        ViewTableColumn
        ViewTableFilter
        ViewTableSort
        ViewChartSeries
        ViewSelectOptionValue
      ]))))

(define-form view-spec-module
  (:phase meta)
  (:extensions
    (:protocol/module
      (:name ViewSpec)
      (:imports [
        [ViewActionOrList from ViewAction ViewActionOrListSchema]
        [ViewStateDecl from ViewState ViewStateDecl]
        [ViewNode from ViewNode ViewNode]
      ])
      (:objects [
        ViewQueryInlineBinding
        ViewQueryRefBinding
        ViewInputParam
        ViewTheme
        ViewCapabilities
        ViewSpecMarker
        ViewSpec
      ])
      (:unions [ViewQueryBinding]))))
