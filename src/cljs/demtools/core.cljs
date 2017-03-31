(ns demtools.core
  (:require [om.next :as om :refer-macros [defui]]
            [om.dom :as dom]
            [goog.dom :as gdom]
            [clojure.string :as str]
            [cljs.core.async :as async
             :refer [close! <! >! put! chan pub sub]]
            [cljsjs.fixed-data-table]
            [demtools.demo :refer [parse]]
            [tf2demo])
  (:require-macros
   [cljs.core.async.macros :as asyncm :refer [go go-loop]]))

(enable-console-print!)

(def Table js/FixedDataTable.Table)
(def Column js/FixedDataTable.Column)
(def Cell js/FixedDataTable.Cell)

(def jsx js/React.createElement)

(def app-state
  (atom {:packets nil
         :repl/input ""
         :repl/output ""
         :selected-idx nil
         :count 0
         :limit 50
         :offset 0
         :file/results ""}))

(def w (js/Worker. "js/compiled/demtools-worker.js"))
(set! (.-onmessage w)
      (fn [& e] (js/console.log "received" e)))

(defmulti read (fn [& args] (namespace (apply om/dispatch args))))
(defn direct-read [state k] {:value (get @state k nil)})
(defmethod read nil [{:keys [state] :as env} k {:keys [idx file offset limit]}]
  (case k
    ;;    :visible-packets

    ;;     :packets
    ;;     (let [packets (or (get @state :packets []) [])
    ;;           last-idx (max 0 (dec (count packets)))
    ;;           start (min offset last-idx)
    ;;           end (min (+ limit offset) last-idx)]
    ;;       {:value (subvec packets start end)})
    ;;     :packet (when idx {:value (get (get @state :packets []) idx)})
    ;;     :packets-count {:value (count (get @state :packets))}

    (direct-read state k)))

(defmethod read "repl"
  [{:keys [state ast] :as env} k {:keys [:repl/input] :as data}]
  (case k
    :repl/output
    (let [old-value (get @state k "Loading...")]
      {:value old-value :repl ast})))

(defmethod read "packets"
  [{:keys [state ast] :as env} k {:keys [idx offset limit]}]
  (case k
    :packets/packet
    {:value (nth (get @state :packets) idx)}

    :packets/count
    {:value (count (get @state :packets))}

    :packets/slice
    (let [packets (get @state :packets)]
      {:value (subvec packets
                      offset
                      (min (+ offset limit) (+ offset (count packets))))})))

(defmethod read "file"
  [{:keys [state ast] :as env} k {:keys [idx file offset limit]}]
  (case k
    :file/results (direct-read state k)
    :file/file
    (let [old-file (get @state k :not-loaded)]
      (merge {:value old-file}
             (when (not= old-file file) {:file ast})))))

(defn mutate [{:keys [state] :as env} key {:keys [value]}]
  (cond
    #{`selected-idx `offset}
    (let [state-key (-> key name keyword)]
      {:value {:keys [state-key]}
       :action #(swap! state assoc state-key value)})

    #{`packets}
    (let [state-key (-> key name keyword)]
      {:value {:keys [state-key]}
       :action #(swap! state assoc state-key value)})

    true {:value (swap! state assoc key value)}))

(defn send-to-chan [c]
  (fn [{:keys [file repl] :as data} cb]
    (when file
      (let [{[file] :children} (om/query->ast file)
            query (get-in file [:params :file/file])]
        (put! c [:file [query cb]])))
    (when repl
      (let [{[repl] :children} (om/query->ast repl)
            query (get-in repl [:params :repl/input])]
        (put! c [:repl [query cb]])))))

(defn file-process-loop [control-chan]
  (go-loop [current-cb nil
            current-file nil
            current-parse-chan nil
            current-packets nil]
    (let [[m port] (alts! (remove nil? [control-chan current-parse-chan]))]
      (cond
        (= port control-chan)
        (let [[data cb] m]
          (let [file data]
            (if (and file (not= file current-file))
              (do (when current-parse-chan (close! current-parse-chan))
                  (cb {:packets []})
                  (recur cb file (when file (parse file)) []))
              (recur current-cb current-file current-parse-chan current-packets))))

        (= port current-parse-chan)
        (do
          (let [new-packets (into current-packets m)]
            (current-cb {:packets new-packets})
            (recur current-cb
                   current-file
                   current-parse-chan
                   new-packets)))))))

(defn repl-process-loop [control-chan]
  (go-loop [current-cb nil
            current-file nil
            current-parse-chan nil
            current-packets nil]
    (let [[m port] (alts! (remove nil? [control-chan current-parse-chan]))]
      (cond
        (= port control-chan)
        (let [[data cb] m]
          (recur current-cb current-file current-parse-chan current-packets))

        (= port current-parse-chan)
        (do
          (let [new-packets (into current-packets m)]
            (current-cb {:packets new-packets})
            (recur current-cb
                   current-file
                   current-parse-chan
                   new-packets)))))))

(def send-chan (chan))
(def router (pub send-chan first))

(def repl-chan (chan 1 (map second)))
(repl-process-loop repl-chan)
(sub router :repl repl-chan)

(def file-chan (chan 1 (map second)))
(file-process-loop file-chan)
(sub router :file file-chan)

(def reconciler
  (om/reconciler
   {:state app-state
    :parser (om/parser {:read read :mutate mutate})
    :send (send-to-chan send-chan)
    ;;    :merge our-merge
    :remotes [:file :repl]}))

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

(defn packet-view [p]
  (case (.-packetType p)
    "setConVar"
    (->> (.-vars p)
         js/Object.entries
         (map (fn [[k v]] (str k "=\"" v "\"")))
         (str/join " "))

    "netTick"
    (str "Tick: " (.-tick p)
         " frameTime: " (.-frameTime p)
         " stdDev: " (.-stdDev p))

    "gameEvent"
    (-> (aget p "event") js/JSON.stringify)

    "consoleCmd"
    (aget p "command")

    "print"
    (aget p "value")

    (str/join "; " (js/Object.keys p))))

(defn packet-type-cell [offset data]
  (fn [props-js]
    (let [row-idx (- (aget props-js "rowIndex") offset)]
      (jsx
       Cell props-js
       (if-let [row (get data row-idx)]
         (str (aget row "packetType"))
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
  (params [_] {:file nil :repl-input "" :offset 0})
  static om/IQuery
  (query [this]
         '[:selected-idx :offset :limit
           ;;           :display/visible-packets
           :packets
           (:packets/slice {:offset ?offset :limit 20})
           :packets/count
           (:repl/output {:repl/input ?repl-input})
           :file/results
           (:file/file {:file/file ?file})])
  Object
  (render [this]
    (let [{:keys [file repl-input]} (om/get-params this)
          {:keys
           [selected-idx limit offset results output
            slice count]}
          (om/props this)

          packets slice
          packets-count count
          last-idx (max 0 (dec packets-count))
          packet (when selected-idx
                   (nth packets (min last-idx selected-idx) nil))
          start (min offset last-idx)
          end (min (+ limit offset) last-idx)
          packets (subvec packets start end)]
      (println "hi" (keys (om/props this)))
      (dom/div nil
        (dom/h1 nil "Demo parser")
        (file-upload this)
        (dom/textarea
         #js {:value repl-input
              :onChange
              (fn [e]
                (let [new-value (-> e .-target .-value)]
                  (om/update-query!
                   this
                   (fn [s] (assoc-in s [:params :repl-input] new-value)))))})
        repl-input
        output
        (when packets (dom/p nil (str "Loaded " packets-count " packets.")))
        (when file (file-view this results))
        (when packets
          (jsx Table
               #js {:rowHeight 32
                    :headerHeight 32
                    :rowsCount packets-count
                    :onScrollStart
                    (fn [x y]
                      (let [new-offset (max 0 (- (int (/ y 32)) 10))]
                        (om/transact! this `[(offset {:value ~new-offset})])))
                    :onScrollEnd
                    (fn [x y]
                      (let [new-offset (max 0 (- (int (/ y 32)) 10))]
                        (om/transact! this `[(offset {:value ~new-offset})])))
                    :onRowClick
                    (fn [_ new-idx]
                      (om/transact! this `[(selected-idx {:value ~new-idx})]))
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
          (dom/div nil (js/JSON.stringify packet)))))))


(def root (om/factory RootComponent))

(om/add-root! reconciler RootComponent (gdom/getElement "app"))

(defn on-figwheel-reload [& args] (println "Figwheel reloaded!" args))


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


;; (defn combine-merge-result [a b]
;;   {:keys (concat (:keys a) (:keys b))
;;    :next (merge (:next a) (:next b))
;;    :tempids (concat (:tempids a) (:tempids b))})

;; (defn merge-packets [state new-packets]
;;   {:keys [:packets]
;;    :next (update state :packets #(vec (concat % new-packets)))})

;; (defn our-merge [reconciler state novelty query]
;;   (let [{:keys [partial-packets]} novelty
;;         other-novelty (dissoc novelty :partial-packets)
;;         results (om/default-merge reconciler state other-novelty query)]
;;     (if partial-packets
;;       (combine-merge-result results (merge-packets state partial-packets))
;;       results)))
