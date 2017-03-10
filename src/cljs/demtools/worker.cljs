(ns demtools.worker
  (:require [clojure.string :as str]
            ;;[cljs.core.async :as async :refer [<! >! put! chan]]
            ;;[tf2demo]
            )
;;  (:require-macros [cljs.core.async.macros :as asyncm :refer [go go-loop]])
  )

(enable-console-print!)

(defn- helper [x])

(defn dispatcher [m]
  (println "Received" m)
  (js/postMessage (str "Some cool result: " (js/Math.random))))

(set! js/onmessage dispatcher)

(js/console.log "We're in a worker!")
(println "All up in it!")
