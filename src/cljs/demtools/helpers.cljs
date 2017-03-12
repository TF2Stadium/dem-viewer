(ns demtools.helpers
  (:require [clojure.walk :as walk]
            [tf2demo]))

(defn plainify [o]
  (let [new-o #js {}]
    (doseq [k (js/Object.getOwnPropertyNames o)]
      (aset new-o k (aget o k)))
    (js->clj new-o)))

(defn plainify-deep
  ([o] (plainify-deep o (constantly true)))
  ([o types] (walk/prewalk #(if (types (type %)) (plainify %) %) o)))
