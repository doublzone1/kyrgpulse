"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import ApartmentList from "@/components/ApartmentList";
import ErrorBoundary from "@/components/ErrorBoundary";
import PriceChart from "@/components/PriceChart";
import PricePredictor from "@/components/PricePredictor";
import PriceTrend from "@/components/PriceTrend";
import StatsCards from "@/components/StatsCards";
import ZoneComparison from "@/components/ZoneComparison";
import ZonePriceTrendChart from "@/components/ZonePriceTrendChart";
import AffordabilityWidget from "@/components/AffordabilityWidget";
import SeasonalityChart from "@/components/SeasonalityChart";
import TopDeals from "@/components/TopDeals";
import { analyticsAPI, apartmentsAPI } from "@/lib/api";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] flex items-center justify-center text-neutral-500 bg-surface-card rounded-lg border border-surface-border">
      Загрузка карты...
    </div>
  ),
});

export default function Dashboard() {
  const {
    data: statsRes,
    isLoading: statsLoading,
    isError: statsError,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["stats"],
    queryFn: apartmentsAPI.getStats,
    refetchInterval: 60000,
  });

  const {
    data: apartmentsRes,
    isLoading: aptsLoading,
    isError: apartmentsError,
    refetch: refetchApartments,
  } = useQuery({
    queryKey: ["apartments-dashboard"],
    queryFn: () => apartmentsAPI.search({ limit: 12, sort: "date_desc" }),
  });

  const {
    data: distributionRes,
    isLoading: distributionLoading,
    isError: distributionError,
    refetch: refetchDistribution,
  } = useQuery({
    queryKey: ["distribution"],
    queryFn: analyticsAPI.getDistribution,
  });

  const refreshAll = () => {
    refetchStats();
    refetchApartments();
    refetchDistribution();
  };

  return (
    <div className="min-h-screen mountain-bg">
      <div className="relative z-10 max-w-7xl mx-auto p-8">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-5 md:flex-row md:justify-between md:items-center mb-12"
        >
          <div className="flex items-center gap-4">
            <Link href="/" className="glass p-3 rounded-lg hover:bg-white/10 transition-all">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-5xl font-black neon-text">KyrgPulse</h1>
              <p className="text-primary-400 text-sm">Бишкек · данные после последнего парсинга lalafo.kg</p>
            </div>
          </div>
          <button
            onClick={refreshAll}
            className="glass px-6 py-3 rounded-lg flex items-center justify-center gap-2 text-sm hover:bg-white/10"
          >
            <RefreshCw className={`w-4 h-4 ${statsFetching ? "animate-spin" : ""}`} />
            Обновить
          </button>
        </motion.header>

        <StatsCards stats={statsRes?.data} loading={statsLoading} error={statsError} />

        <div className="grid grid-cols-12 gap-8 mt-10">
          <div className="col-span-12 lg:col-span-7">
            <div className="glass rounded-lg p-8">
              <h2 className="text-2xl font-semibold mb-6">
                Средняя цена по числу комнат (KGS)
              </h2>
              <PriceChart
                data={distributionRes?.data || []}
                loading={distributionLoading}
                error={distributionError}
              />
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <PricePredictor />
          </div>

          <div className="col-span-12">
            <ErrorBoundary>
              <PriceTrend />
            </ErrorBoundary>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <div className="glass rounded-lg p-6 h-full">
              <h2 className="text-xl font-semibold mb-4">Карта зон · Бишкек</h2>
              <ErrorBoundary>
                <MapView apartments={apartmentsRes?.data?.items || []} />
              </ErrorBoundary>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <ErrorBoundary>
              <ZoneComparison />
            </ErrorBoundary>
          </div>

          <div className="col-span-12">
            <ErrorBoundary>
              <ZonePriceTrendChart />
            </ErrorBoundary>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <ErrorBoundary>
              <AffordabilityWidget />
            </ErrorBoundary>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <ErrorBoundary>
              <SeasonalityChart />
            </ErrorBoundary>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <ErrorBoundary>
              <TopDeals />
            </ErrorBoundary>
          </div>

          <div className="col-span-12">
            <ApartmentList
              apartments={apartmentsRes?.data?.items || []}
              loading={aptsLoading}
              error={apartmentsError}
              onRetry={refetchApartments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
