(ns demtools.core
  (:require [om.next :as om :refer-macros [defui]]
            [om.dom :as dom]
            [goog.dom :as gdom]
            [clojure.string :as str]
            [cljs.core.async :as async :refer [close! <! >! put! chan]]
            [cljsjs.fixed-data-table]
            [demtools.demo]
            [tf2demo])
  (:require-macros
   [cljs.core.async.macros :as asyncm :refer [go go-loop]]))

(enable-console-print!)

(def Table js/FixedDataTable.Table)
(def Column js/FixedDataTable.Column)
(def Cell js/FixedDataTable.Cell)

(def jsx js/React.createElement)

(def send-chan (chan))

(def app-state
  (atom {:title "Hello Chestnut!"
         :packets nil
         :count 0
         :file/results ""}))

(def w (js/Worker. "js/compiled/demtools-worker.js"))
(set! (.-onmessage w)
      (fn [& e] (js/console.log "received" e)))
(.postMessage w "hi guy")


(defmulti read (fn [& args] (namespace (apply om/dispatch args))))
(defn direct-read [state k] {:value (get @state k nil)})
(defmethod read nil [{:keys [state] :as env} k {:keys [idx file offset limit]}]
  (case k
    :packets
    {:value (->> (or (get @state :packets []) [])
                 (drop offset)
                 (take limit)
                 vec)}

    :packet (when idx {:value (get (get @state :packets []) idx)})
    :packets-count {:value (count (get @state :packets))}

    (direct-read state k)))
(defmethod read "file"
  [{:keys [state ast] :as env} k {:keys [idx file offset limit]}]
  (case k
    :file/results
    :file/file
    (let [old-file (get @state k :not-loaded)]
      (merge {:value old-file}
             (when (not= old-file file) {:file ast})))))

(defn mutate [{:keys [state] :as env} key params]
  (cond true {:value nil}))

(defn send-to-chan [c]
  (fn [{:keys [file] :as data} cb]
    (when file
      (let [{[file] :children} (om/query->ast file)
            query (get-in file [:params :file/file])]
        (put! c [query cb])))))

(defn setImmediate [fn] (js/setTimeout fn 1000))

;; parse the next message, return a list of packets; or nil if we're done
(defn parse-1 [parser]
  ;; from Parser.tick
  (let [msg (.readMessage parser (.-stream parser) (.-match parser))]
    ;; from Parser.handleMessage:
    (when msg
      (let [packets (when (.-parse msg) (.parse msg))]
        (doseq [p packets] (.emit parser "packet" p))
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
            (if (and packets (< @idx n))
              (recur)
              @idx)))]
    (js/console.log n real-len)
    (set! (.-length chunk) real-len)
    chunk))

(def ^:private parse-chunk-size 500)
(defn parse-loop-async [parser output-chan]
  (let [packets (parse-n parser parse-chunk-size)]
    (when packets
      (put! output-chan packets
            (fn [result]
              (when result
                (setImmediate #(parse-loop-async parser output-chan))))))))

;; demo -> channel of packets
(defn parse [file]
  (let [output (chan)
        fr (js/FileReader.)]

    (set!
     (.-onload fr)
     (fn []
       (let [buf (.-result fr)
             demo (js/tf2demo.Demo. buf)
             parser (.getParser demo)
             header (.readHeader parser)]
         (js/console.log header)
         (parse-loop-async parser output))))

    (.readAsArrayBuffer fr file)
    output))

;; (defn process-loop [c]
;;   (go-loop [current-file nil]
;;     (let [[file cb] (<! c)]
;;       (when (not= file current-file)
;;         (when file
;;           (let [fr (js/FileReader.)]
;;             (set!
;;              (.-onload fr)
;;              (fn []
;;                (let [buf (.-result fr)
;;                      dem (js/tf2demo.Demo. buf)
;;                      parser (.getParser dem)
;;                      packets (js/Array. 50000)
;;                      idx (atom 0)]
;;                  (.on parser "packet"
;;                       #(let [i @idx]
;;                          (when (< i 3000)
;;                            (aset packets @idx %)
;;                            (swap! idx inc))))
;;                  (.readHeader parser)
;;                  (.parseBody parser)

;;                  (when (< @idx (.-length packets))
;;                    (set! (.-length packets) @idx))

;;                  (let [p (js->clj packets)
;;                        x (js/console.log "done converting" (count p))]
;;                    (cb {:file/results (str "some file contents: "
;;                                            (.-name file)
;;                                            (.-byteLength buf)
;;                                            " "
;;                                            (.-length packets))
;;                         :partial-packets p})))))
;;             (.readAsArrayBuffer fr file)))
;;         (cb {:file/results (str "some file contents: " (when file (.-name file)))
;;              :packets []}))
;;       (recur file))))

(defn process-loop [control-chan]
  (go-loop [current-cb nil
            current-file nil
            current-parse-chan nil
            current-packets nil]
    (let [[m port] (alts! (remove nil? [control-chan current-parse-chan]))]
      (cond
        (= port control-chan)
        (let [[file cb] m]
          (println "Control chan:" file)
          (if (and file (not= file current-file))
            (do (when current-parse-chan (close! current-parse-chan))
                (cb {:packets []})
                (recur cb file (when file (parse file)) []))
            (recur current-cb current-file current-parse-chan current-packets)))

        (= port current-parse-chan)
        (do
          (let [new-packets (into current-packets m)]
            (current-cb {:packets new-packets})
            (recur current-cb
                   current-file
                   current-parse-chan
                   new-packets)))))))

(defn combine-merge-result [a b]
  {:keys (concat (:keys a) (:keys b))
   :next (merge (:next a) (:next b))
   :tempids (concat (:tempids a) (:tempids b))})

(defn merge-packets [state new-packets]
  {:keys [:packets]
   :next (update state :packets #(vec (concat % new-packets)))})

;; (defn our-merge [reconciler state novelty query]
;;   (let [{:keys [partial-packets]} novelty
;;         other-novelty (dissoc novelty :partial-packets)
;;         results (om/default-merge reconciler state other-novelty query)]
;;     (if partial-packets
;;       (combine-merge-result results (merge-packets state partial-packets))
;;       results)))

(def reconciler
  (om/reconciler
   {:state app-state
    :parser (om/parser {:read read :mutate mutate})
    :send (send-to-chan send-chan)
    ;;    :merge our-merge
    :remotes [:file]}))
(process-loop send-chan)

(defn file-upload [ui]
  (dom/input
   #js {:type "file"
        :onChange #(let [f (-> % .-target .-files js/Array.from (nth 0))]
                     (om/update-query!
                      ui
                      (fn [s] (assoc-in s [:params :file] f))))}))

(defn file-view [ui file]
  (when file
    (dom/div nil (str "File loaded: " (.-name file)))))

(defmulti packet-view (fn [p] (get p "packetType" :default)))
(defmethod packet-view :default [p] (str/join ", " (keys p)))
(defmethod packet-view "setConVar" [p]
  (->> (p "vars") (map (fn [[k v]] (str k "=\"" v "\""))) (str/join " ")))
(defmethod packet-view "netTick" [p]
  (str "Tick: " (p "tick") " frameTime: " (p "frameTime")
       " stdDev: " (p "stdDev")))
(defmethod packet-view "gameEvent" [p]
  (-> (p "event") clj->js js/JSON.stringify))
(defmethod packet-view "packetEntities" [p]
  (->> (p "entities")
       (mapv (fn [ent]
               (str (ent "entityIndex")
                    "-" (get-in ent ["serverClass" "name"] nil)
                    "-" (count (get ent "props" []))
                    )))
       (str/join "; ")
       ))
;; (defmethod packet-view "serverInfo" [p]
;;   (str "frameTime: " (p "frameTime") " stdDev: " (p "stdDev")))
(defmethod packet-view "consoleCmd" [p] (p "command"))
(defmethod packet-view "print" [p] (p "value"))

(defn packet-type-cell [offset data]
  (fn [props-js]
    (let [row-idx (- (aget props-js "rowIndex") offset)]
      (jsx
       Cell props-js
       (if-let [row (get data row-idx)]
         (str (row "packetType"))
         "")))))

(defn data-cell [offset data]
  (fn [props-js]
    (let [row-idx (- (aget props-js "rowIndex") offset)]
      (jsx
       Cell props-js
       (if-let [row (get data row-idx)]
         (packet-view row)
         "")))))

(defui RootComponent
  static om/IQueryParams
  (params [_] {:file nil :idx nil :offset 0 :limit 50})
  static om/IQuery
  (query [this]
         '[:title
           (:packet {:idx ?idx})
           (:packets {:offset ?offset :limit ?limit})
           :packets-count
           :file/results
           (:file/file {:file/file ?file})])
  Object
  (render [this]
    (let [{:keys [results title packet packets packets-count]}
          (om/props this)
          {:keys [offset file]} (om/get-params this)]
      (dom/div nil
        (dom/h1 nil title)
        (dom/p nil results)
        (file-upload this)
        (when packets
          (dom/p nil
                 (str "Loaded " packets-count " packets.")))
        (when file (file-view this results))
        (when packets
          (jsx Table
               #js {:rowHeight 32
                    :headerHeight 32
                    :rowsCount packets-count
                    :onScrollEnd
                    (fn [x y]
                      (let [new-offset (max 0 (- (int (/ y 32)) 10))]
                        (om/update-query!
                         this #(assoc-in % [:params :offset] new-offset))))
                    :onRowClick
                    (fn [_ new-idx]
                      (om/update-query!
                       this #(assoc-in % [:params :idx] new-idx)))
                    :width 800
                    :height 800}
               (jsx Column
                    #js {:width 150
                         :header (jsx Cell #js {} "Packet Type")
                         :cell (packet-type-cell offset packets)})
               (jsx Column
                    #js {:width (- 800 150)
                         :header (jsx Cell #js {} "Data")
                         :cell (data-cell offset packets)})))
        (when packet
          (dom/div nil (js/JSON.stringify (clj->js packet))))))))


(def root (om/factory RootComponent))

(om/add-root! reconciler RootComponent (gdom/getElement "app"))

(defn on-figwheel-reload [& args] (println "Figwheel reloaded!" args))
