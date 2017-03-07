(ns demtools.test-runner
  (:require
   [doo.runner :refer-macros [doo-tests]]
   [demtools.core-test]
   [demtools.common-test]))

(enable-console-print!)

(doo-tests 'demtools.core-test
           'demtools.common-test)
