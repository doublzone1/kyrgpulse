"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, RefreshCw, TrendingUp } from "lucide-react";

import { analyticsAPI, getApiErrorMessage } from "@/lib/api";

const ROOM_OPTIONS = [
  { value: 0, label: "Студия" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4+" },
];

export default function PricePredictor() {
  const [rooms, setRooms] = useState(2);
  const [area, setArea] = useState("");
  const [floor, setFloor] = useState("");

  const { mutate, data, isPending, error, reset } = useMutation({
    mutationFn: () =>
      analyticsAPI.predictPrice({
        rooms,
        total_area: parseFloat(area),
        floor: floor.trim() || undefined,
      }),
  });

  const result = data?.data;
  const canSubmit = !!area && parseFloat(area) > 0 && !isPending;

  function handleRooms(val: number) {
    setRooms(val);
    reset();
  }

  return (
    <div className="glass rounded-lg p-6 md:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-md bg-accent-500/10 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-accent-400" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-neutral-100">ML-оценка цены</h2>
          <p className="text-xs text-neutral-500">RandomForest · данные lalafo.kg</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-5">
        {/* Rooms */}
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Комнаты</p>
          <div className="flex gap-1.5">
            {ROOM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleRooms(opt.value)}
                className={`flex-1 py-2 text-sm rounded-md transition-all ${
                  rooms === opt.value
                    ? "bg-primary-500/15 text-primary-400 border border-primary-500/25"
                    : "bg-surface-raised text-neutral-400 border border-transparent hover:text-neutral-200 hover:bg-surface-overlay"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Area */}
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Площадь (м²)</p>
          <input
            type="number"
            min="10"
            max="500"
            placeholder="например, 55"
            value={area}
            onChange={(e) => { setArea(e.target.value); reset(); }}
            className="w-full bg-surface-card border border-surface-border focus:border-primary-500 rounded-md px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors"
          />
        </div>

        {/* Floor */}
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Этаж{" "}
            <span className="text-neutral-600 normal-case tracking-normal">— необязательно</span>
          </p>
          <input
            type="text"
            placeholder="5 или 5/9"
            value={floor}
            onChange={(e) => { setFloor(e.target.value); reset(); }}
            className="w-full bg-surface-card border border-surface-border focus:border-primary-500 rounded-md px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition-colors"
          />
        </div>

        <button
          onClick={() => mutate()}
          disabled={!canSubmit}
          className="w-full py-3 rounded-md bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed text-surface-page text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Считаем...
            </>
          ) : (
            <>
              <TrendingUp className="w-4 h-4" />
              Оценить стоимость
            </>
          )}
        </button>
      </div>

      {/* Результат / ошибка */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="pred-error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 p-4 rounded-lg bg-status-down/10 border border-status-down/20"
          >
            <p className="text-sm text-status-down">{getApiErrorMessage(error)}</p>
            <p className="text-xs text-neutral-500 mt-1">
              Возможно, модель не обучена — запустите обучение в{" "}
              <a href="/admin" className="text-primary-400 hover:text-primary-300 underline">
                /admin
              </a>
              .
            </p>
          </motion.div>
        )}

        {result && !error && (
          <motion.div
            key="pred-result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-5 p-5 rounded-lg bg-surface-raised border border-surface-border-strong"
          >
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
              Оценочная стоимость
            </p>

            <p className="font-numeric text-4xl font-bold text-primary-400 leading-none">
              {result.predicted_price.toLocaleString("ru-RU")}
              <span className="text-xl text-neutral-500 ml-1.5 font-normal">KGS</span>
            </p>
            <p className="font-numeric text-sm text-neutral-400 mt-1.5">
              {result.price_per_m2.toLocaleString("ru-RU")} KGS/м²
            </p>

            {result.converted_prices && (
              <div className="flex gap-5 mt-4 pt-4 border-t border-surface-border">
                {(["USD", "EUR", "RUB"] as const).map((cur) => {
                  const val = result.converted_prices?.[cur];
                  if (!val) return null;
                  return (
                    <div key={cur}>
                      <p className="text-xs text-neutral-600">{cur}</p>
                      <p className="font-numeric text-sm text-neutral-300">
                        {Math.round(val).toLocaleString("ru-RU")}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {(result.model_mae != null || result.model_r2 != null) && (
              <div className="flex flex-wrap gap-5 mt-3 pt-3 border-t border-surface-border">
                {result.model_mae != null && (
                  <div>
                    <p className="text-xs text-neutral-600">Погрешность (MAE)</p>
                    <p className="font-numeric text-xs text-neutral-400">
                      ±{Math.round(result.model_mae).toLocaleString("ru-RU")} KGS
                    </p>
                  </div>
                )}
                {result.model_r2 != null && (
                  <div>
                    <p className="text-xs text-neutral-600">Точность (R²)</p>
                    <p className="font-numeric text-xs text-neutral-400">
                      {result.model_r2.toFixed(3)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {result.note && (
              <p className="text-xs text-neutral-600 mt-3">{result.note}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
