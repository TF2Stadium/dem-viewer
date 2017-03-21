(ns demtools.demo
  (:require [demtools.helpers :as h]
            [tf2demo]))

(def obj-proto (js/Object.getPrototypeOf #js {}))

(extend-type js/tf2demo.PacketEntity
  IEncodeClojure
  (-js->clj [x opts]
    (js/Object.setPrototypeOf x obj-proto)
    ))

;; (extend-type js/tf2demo.SendProp
;;   IEncodeClojure
;;   (-js->clj [x opts] (h/plainify x)))
;; (extend-type js/tf2demo.SendPropDefinition
;;   IEncodeClojure
;;   (-js->clj [x opts] (h/plainify x)))
;; (extend-type js/tf2demo.ServerClass
;;   IEncodeClojure
;;   (-js->clj [x opts] (h/plainify x)))
