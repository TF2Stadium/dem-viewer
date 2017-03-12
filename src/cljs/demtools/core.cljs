(ns demtools.core
  (:require [om.next :as om :refer-macros [defui]]
            [om.dom :as dom]
            [goog.dom :as gdom]
            [clojure.string :as str]
            [cljs.core.async :as async :refer [<! >! put! chan]]
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
         :packets []
         :count 0
         :file/results ""}))

(def w (js/Worker. "js/compiled/demtools-worker.js"))
(set! (.-onmessage w)
      (fn [& e] (js/console.log "received" e)))
(.postMessage w "hi guy")


(defmulti read (fn [& args] (namespace (apply om/dispatch args))))
(defn direct-read [state k] {:value (get @state k nil)})
(defmethod read nil [{:keys [state] :as env} k] (direct-read state k))
(defmethod read "file"
  [{:keys [state ast] :as env} k {:keys [idx file offset limit]}]
  (case k
    :file/packet (when idx {:value (get (get @state :packets []) idx)})
    :file/packets
    {:value (->> (get @state :packets []) (drop offset) (take limit) vec)}

    :file/packets-count {:value (count (get @state :packets))}
    :file/results {:value (count (get @state :file/results))}
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

(defn process-loop [c]
  (go-loop [current-file nil]
    (let [[file cb] (<! c)]
      (when (not= file current-file)
        (when file
          (let [fr (js/FileReader.)]
            (set!
             (.-onload fr)
             (fn []
               (let [buf (.-result fr)
                     dem (js/tf2demo.Demo. buf)
                     parser (.getParser dem)
                     packets (js/Array. 50000)
                     idx (atom 0)]
                 (.on parser "packet"
                      #(let [i @idx]
                         (when (< i 3000)
                           (aset packets @idx %)
                           (swap! idx inc))))
                 (.readHeader parser)
                 (.parseBody parser)

                 (when (< @idx (.-length packets))
                   (set! (.-length packets) @idx))

                 (let [p (js->clj packets)
                       x (js/console.log "done converting" (count p))]
                   (cb {:file/results (str "some file contents: "
                                           (.-name file)
                                           (.-byteLength buf)
                                           " "
                                           (.-length packets))
                        :packets p})))))
            (.readAsArrayBuffer fr file)))
        (cb {:file/results
             (str "some file contents: " (when file (.-name file)))}))
      (recur file))))

(def reconciler
  (om/reconciler
   {:state app-state
    :parser (om/parser {:read read :mutate mutate})
    :send (send-to-chan send-chan)
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
           (:file/packet {:idx ?idx})
           (:file/packets {:offset ?offset :limit ?limit})
           :file/packets-count
           :file/results
           (:file/file {:file/file ?file})])
  Object
  (render [this]
    (let [{:keys [results title file/packet file/packets file/packets-count]}
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
        (when file
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
