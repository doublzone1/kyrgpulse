/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lalafo.kg" },
      { protocol: "https", hostname: "house.kg" },
      { protocol: "https", hostname: "*.lalafo.kg" },
      { protocol: "https", hostname: "*.house.kg" },
    ],
  },
};

export default nextConfig;
