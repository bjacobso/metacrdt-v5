(define-entity Employee
  (:field [employee/active Bool])
  (:field [employee/name String]))

(define-query active-employees
  (:from Employee)
  (:where employee/active)
  (:select [employee/name]))
