(ns demtools.demo
  (:require  [cljs.core.async :as async :refer [close! <! >! put! chan]]
             [demtools.helpers :as h]
             [tf2demo])
  (:require-macros
   [cljs.core.async.macros :as asyncm :refer [go go-loop]]))

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


(defn setImmediate [fn] (js/setTimeout fn 50))

;; parse the next message, return a list of packets; or nil if we're done
(defn parse-1 [parser]
  ;; from Parser.tick
  (let [msg (.readMessage parser (.-stream parser) (.-match parser))]
    ;; from Parser.handleMessage:
    (when msg
      (let [packets (when (.-parse msg) (.parse msg))]
        (doseq [p packets] (.emit parser "packet" p))
        (when packets
          (.map packets (fn [p] (js-delete p "tables"))))
        packets))))

;; parse the next messages to get at least n packets (may return more than
;; the requested n packets), or until end of parser
(defn parse-n [parser n]
  (let [chunk (js/Array. n)
        idx (atom 0)
        real-len
        (loop []
          (let [packets (parse-1 parser)]
            (doseq [p packets]
              (aset chunk @idx p)
              (swap! idx inc))
;;             (println "loopin loopin" @idx n (not packets) (and packets (< @idx n)))
            (if (and packets (< @idx n))
              (recur)
              @idx)))]
    (set! (.-length chunk) real-len)
    (vec chunk)))

(def ^:private parse-chunk-size 1000)
(defn parse-loop-async [parser output-chan]
  (let [packets (parse-n parser parse-chunk-size)]
    (when packets
      (put! output-chan packets
            (fn [result]
              (when result
                (println (count packets) parse-chunk-size (>= (count packets) parse-chunk-size))
  ;;              (setImmediate #(parse-loop-async parser output-chan))

            ;;    (if (>= (count packets) parse-chunk-size)
                  (setImmediate #(parse-loop-async parser output-chan))
              ;;    )

;;                 (if (>= (count packets) parse-chunk-size)
;;                   (setImmediate #(parse-loop-async parser output-chan))
;;                   (close! output-chan))

                ))))))
