(define-entity Employee
  (:field [employee/active Bool])
  (:field [employee/name String]))

(define-record "emp:active" Employee
  (:field [employee/active true])
  (:field [employee/name "Alice"]))
