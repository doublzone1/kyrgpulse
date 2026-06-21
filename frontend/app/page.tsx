"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BarChart3,
  Brain,
  GitCompare,
  MapPin,
  Search,
  Star,
  TrendingUp,
} from "lucide-react";

import CategoryGrid from "@/components/CategoryGrid";
import PulseIndicator from "@/components/PulseIndicator";
import {
  buildSearchHref,
  countActiveFilters,
  readLastFilters,
  useCompare,
  useFavorites,
} from "@/lib/storage";

const features = [
  {
    icon: Search,
    title: "Парсинг lalafo.kg",
    desc: "Сбор свежих объявлений по Бишкеку",
  },
  {
    icon: Brain,
    title: "ML-прогноз",
    desc: "Оценка аренды по комнатам, площади и этажу",
  },
  {
    icon: MapPin,
    title: "Карта зон",
    desc: "Приблизительные зоны по тексту адресов",
  },
  {
    icon: TrendingUp,
    title: "Аналитика цен",
    desc: "Средние цены, распределение и валюта",
  },
];

export default function Home() {
  const favorites = useFavorites();
  const compare = useCompare();
  const [searchHref, setSearchHref] = useState("/search");
  const [activeFilters, setActiveFilters] = useState(0);

  useEffect(() => {
    const last = readLastFilters();
    setSearchHref(buildSearchHref(last));
    setActiveFilters(countActiveFilters(last));
  }, []);

  return (
    <div className="min-h-screen mountain-bg relative overflow-hidden">
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-3 glass px-6 py-3 rounded-lg text-sm mb-8">
            <span className="pulse-dot" aria-hidden />
            <span className="text-neutral-300">
              Кыргызстан · lalafo.kg · пульс рынка аренды
            </span>
          </div>

          <h1 className="font-display text-7xl md:text-8xl font-black neon-text leading-none mb-4">
            KyrgPulse
          </h1>
          <p className="text-2xl md:text-3xl text-neutral-300 mb-2">
            Поиск квартир в аренду в Бишкеке
          </p>
          <p className="text-neutral-500 mb-10 font-numeric text-sm">
            фильтры · карта зон · KGS + USD/EUR/RUB
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href={searchHref}>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="px-10 py-5 rounded-lg bg-[rgb(var(--ember-500))] text-[rgb(var(--ridge-950))] font-semibold text-xl shadow-xl shadow-[rgba(245,158,11,0.20)] hover:bg-[rgb(var(--ember-400))] inline-flex items-center gap-3 transition-colors"
              >
                <Search className="w-5 h-5" />
                Найти квартиру
                {activeFilters > 0 && (
                  <span className="font-numeric inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-[rgb(var(--ridge-950))]/25 text-sm font-medium">
                    {activeFilters}
                  </span>
                )}
              </motion.button>
            </Link>
            <Link href="/dashboard">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="px-8 py-5 rounded-lg glass text-white font-medium text-lg hover:bg-white/10 inline-flex items-center gap-3"
              >
                <BarChart3 className="w-5 h-5" />
                Аналитика
              </motion.button>
            </Link>
            <Link href="/admin">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-5 rounded-lg glass text-neutral-300 font-medium text-base hover:bg-white/10 inline-flex items-center gap-2"
                title="Метрики качества данных и pipeline"
              >
                Data Quality
              </motion.button>
            </Link>
          </div>

          {(favorites.ids.length > 0 || compare.ids.length > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6 text-sm">
              {favorites.ids.length > 0 && (
                <Link
                  href="/favorites"
                  className="glass px-4 py-2 rounded-lg inline-flex items-center gap-2 hover:bg-white/10"
                >
                  <Star className="w-4 h-4 text-amber-300" />
                  Избранное
                  <span className="text-neutral-400">{favorites.ids.length}</span>
                </Link>
              )}
              {compare.ids.length > 0 && (
                <Link
                  href={`/compare?ids=${compare.ids.join(",")}`}
                  className="glass px-4 py-2 rounded-lg inline-flex items-center gap-2 hover:bg-white/10"
                >
                  <GitCompare className="w-4 h-4 text-cyan-300" />
                  Сравнение
                  <span className="text-neutral-400">{compare.ids.length}</span>
                </Link>
              )}
            </div>
          )}
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-16"
        >
          <PulseIndicator variant="full" label="пульс рынка" className="mb-6" />
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display text-2xl font-semibold">Быстрый переход</h2>
            <Link
              href="/search"
              className="text-sm text-[rgb(var(--pulse-400))] hover:text-[rgb(var(--pulse-300))]"
            >
              Все объявления →
            </Link>
          </div>
          <CategoryGrid />
        </motion.section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + index * 0.08 }}
              className="glass rounded-lg p-8 text-left cursor-default"
            >
              <feature.icon className="w-9 h-9 text-[rgb(var(--pulse-400))] mb-6" />
              <p className="font-display font-semibold text-xl mb-2">{feature.title}</p>
              <p className="text-neutral-400">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
