(ns demtools.helpers)

(def ^:private obj-prototype (js/Object.getPrototypeOf #js {}))

(defn plainify [o]
  ;; TODO: investigate the most efficient method for this; mucking
  ;; with prototypes can trigger horrific perf
  (js/JSON.parse (js/JSON.stringify o))
  ;;(js/Object.setPrototypeOf o obj-prototype)
  )
