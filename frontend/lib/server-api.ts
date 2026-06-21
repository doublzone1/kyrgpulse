import type { ApartmentListResponse, ApartmentSearchParams } from "./api";

// Server-to-server URL (Docker: backend service name). Falls back to public URL.
const INTERNAL_API =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000/api";

function toSearchParams(params: ApartmentSearchParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}

export async function fetchApartmentsSSR(
  params: ApartmentSearchParams,
): Promise<ApartmentListResponse | null> {
  const qs = toSearchParams(params);
  try {
    const res = await fetch(`${INTERNAL_API}/apartments/?${qs}`, {
      next: { revalidate: 60 }, // ISR: cache 60 s per unique params
    });
    if (!res.ok) return null;
    return (await res.json()) as ApartmentListResponse;
  } catch {
    return null;
  }
}
