"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0d0d14] text-neutral-500 text-sm">
      Загрузка карты...
    </div>
  ),
});

function WidgetInner() {
  const params = useSearchParams();
  const zone = params.get("zone") || undefined;

  return (
    <div className="w-full h-screen bg-[#0d0d14]">
      <LeafletMap
        center={[42.8746, 74.5698]}
        zoom={12}
        groups={[]}
        geocodedApartments={[]}
      />
      <a
        href={`https://kyrgpulse.app/search${zone ? `?zone=${zone}` : ""}`}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 bg-black/70 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur z-[9999]"
      >
        KyrgPulse
      </a>
    </div>
  );
}

export default function WidgetMapPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-screen bg-[#0d0d14] flex items-center justify-center text-neutral-500 text-sm">
          Загрузка...
        </div>
      }
    >
      <WidgetInner />
    </Suspense>
  );
}
