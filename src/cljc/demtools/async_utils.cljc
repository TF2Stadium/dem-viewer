(ns demtools.async-utils
  (:require [clojure.core.async :as async
             #?@(:clj [:refer [go-loop]])])
  #?(:cljs (:require-macros [cljs.core.async.macros :refer [go-loop]])))

;; credit to: https://gist.github.com/daveray/8703191
(defn merge-chan
  "Takes a *channel* of source channels and returns a channel which
  contains all values taken from them. The returned channel will be
  unbuffered by default, or a buf-or-n can be supplied. The channel
  will close after all the source channels have closed."
  ([in-ch] (merge-chan in-ch nil))
  ([in-ch buf-or-n]
   (let [out-ch (async/chan buf-or-n)]
     (go-loop [cs [in-ch]]
      (if-not (empty? cs)
        (let [[v c] (async/alts! cs)]
          (cond
            (nil? v)
            (recur (filterv #(not= c %) cs))

            (= c in-ch)
            (recur (conj cs v))

            :else
            (do
              (async/>! out-ch v)
              (recur cs))))
        (async/close! out-ch)))
    out-ch)))

(defn intersperse-delay [in-ch d]
  (let [out-ch (async/chan)]
    (go-loop []
      (let [next-val (async/<! in-ch)]
        (if next-val
          (do (async/>! out-ch next-val)
              (async/<!! (async/timeout d))
              (recur))
          (async/close! out-ch))))
    out-ch))

(defn latest-chan
  "Takes a *channel* of source channels and returns a channel which
  contains values takes from the latest channel emitted by *in-ch*.
  The returned channel will be unbuffered by default, or a buf-or-n
  can be supplied. The channel will close after *in-ch* and the
  last source channel has closed."
  ([in-ch] (latest-chan in-ch nil))
  ([in-ch buf-or-n]
   (let [out-ch (async/chan buf-or-n)]
     (go-loop [in-ch' in-ch
                     cur-ch nil]
       (let [cs (remove nil? [in-ch' cur-ch])]
         (if-not (empty? cs)
           (let [[v c] (async/alts! cs)]
             (cond
               (and (= c in-ch) (nil? v)) (recur nil cur-ch)
               (and (= c cur-ch) (nil? v)) (recur in-ch' nil)
               (= c in-ch) (recur in-ch' v)

               :else
               (do
                 (async/>! out-ch v)
                 (recur in-ch' cur-ch))))
           (async/close! out-ch))))
     out-ch)))
