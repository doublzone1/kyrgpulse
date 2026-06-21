import type { Metadata } from "next";
import { Suspense } from "react";

import { fetchApartmentsSSR } from "@/lib/server-api";
import type { ApartmentSearchParams, SortBy } from "@/lib/api";
import SearchPageClient from "./SearchPageClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const rooms = str(sp.rooms);
  const maxPrice = str(sp.max_price);
  const zone = str(sp.zone);

  let roomsLabel = "Квартиры";
  if (rooms === "0") roomsLabel = "Студии";
  else if (rooms) roomsLabel = `${rooms}-комн. квартиры`;

  const parts = [roomsLabel];
  if (maxPrice) parts.push(`до ${Number(maxPrice).toLocaleString("ru-RU")} KGS`);
  if (zone) parts.push(zone);

  const title = `${parts.join(", ")} в аренду · Бишкек`;

  return {
    title,
    description:
      "Поиск квартир в аренду в Бишкеке. Актуальные объявления с lalafo.kg — фильтры по цене, комнатам, зонам города.",
    openGraph: {
      title,
      description: "Актуальная аренда квартир в Бишкеке с аналитикой цен",
      locale: "ru_RU",
      type: "website",
    },
    alternates: { canonical: "/search" },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;

  const SORT_VALUES: SortBy[] = [
    "date_desc", "price_asc", "price_desc", "area_asc", "area_desc",
  ];
  const sortRaw = str(sp.sort);
  const params: ApartmentSearchParams = {
    sort: "date_desc",
    page: 1,
    limit: 24,
    ...(str(sp.q) && { q: str(sp.q) }),
    ...(str(sp.zone) && { zone: str(sp.zone) }),
    ...(str(sp.rooms) && { rooms: Number(str(sp.rooms)) }),
    ...(str(sp.min_price) && { min_price: Number(str(sp.min_price)) }),
    ...(str(sp.max_price) && { max_price: Number(str(sp.max_price)) }),
    ...(str(sp.min_area) && { min_area: Number(str(sp.min_area)) }),
    ...(str(sp.max_area) && { max_area: Number(str(sp.max_area)) }),
    ...(str(sp.page) && { page: Number(str(sp.page)) }),
    ...(sortRaw && (SORT_VALUES as string[]).includes(sortRaw) && { sort: sortRaw as SortBy }),
  };

  const initialData = await fetchApartmentsSSR(params);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen mountain-bg flex items-center justify-center text-neutral-400">
          Загрузка...
        </div>
      }
    >
      <SearchPageClient initialData={initialData} />
    </Suspense>
  );
}
