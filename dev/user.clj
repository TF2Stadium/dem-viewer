(ns user
  (:require [demtools.application]
            [com.stuartsierra.component :as component]
            [figwheel-sidecar.config :as fw-config]
            [figwheel-sidecar.system :as fw-sys]
            [clojure.tools.namespace.repl :refer [set-refresh-dirs]]
            [reloaded.repl :refer [system init start stop go reset reset-all]]
            [ring.middleware.reload :refer [wrap-reload]]
            [figwheel-sidecar.repl-api :as figwheel]))

(defn dev-system []
  (merge
   (demtools.application/app-system)
   (component/system-map
    :figwheel-system (fw-sys/figwheel-system (fw-config/fetch-config))
    :css-watcher (fw-sys/css-watcher {:watch-paths ["resources/public/css"]}))))

(set-refresh-dirs "src" "dev")
(reloaded.repl/set-init! #(dev-system))

(defn run []
  (go))

(defn browser-repl []
  (fw-sys/cljs-repl (:figwheel-system system)))
