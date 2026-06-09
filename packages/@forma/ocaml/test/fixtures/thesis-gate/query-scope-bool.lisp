(define-entity Employee
  (:field [employee/status String]))

(define-query active-employees
  (:from Employee)
  (:where (= employee/status "active"))
  (:select [employee/status]))
