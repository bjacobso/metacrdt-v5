; thesis-gate.lisp
; -----------------------------------------------------------------------------
; Minimal extractable descriptor fixture for the onlang thesis gate.
;
; This avoids Open Ontology domain vocabulary. The goal is to prove that an
; authored descriptor-backed form reaches bidirectional typechecking and that a
; boundary mismatch returns a located HM diagnostic.
; -----------------------------------------------------------------------------

(define-form literal-type
  (:check-fn literal-type/check))

(define-form expected-echo
  (:check-fn expected-echo/check))

(define-form checked-bool
  (:check-fn checked-bool/check))

(define-form inferred-type
  (:infer-fn inferred-type/infer))

(define-form typed-field
  (:slots
    (slot field value
      (:child-identifier name Value)
      (:child-slot value expr (:positional true) (:type Bool)))))

(define-form repeated-bool
  (:slots
    (slot item expr (:many true) (:type Bool))))

(define-macro bool-wrapper [value]
  `(repeated-bool (:item ~value)))

(meta-fn literal-type/check
  (:kind check)
  (:body
    (if (= (get-in input [:args 0 :kind]) "literal")
      (if (= (get-in input [:args 0 :value]) true)
        "Bool"
        "String")
      "Any")))

(meta-fn expected-echo/check
  (:kind check)
  (:body (get input :expected-type)))

(meta-fn checked-bool/check
  (:kind check)
  (:body
    (meta/check-expr
      input
      (meta/positional-arg input 0)
      (type/constant "Bool"))))

(meta-fn inferred-type/infer
  (:kind infer)
  (:body
    (meta/infer-expr-type input (meta/positional-arg input 0))))
