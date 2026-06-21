import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen mountain-bg flex items-center justify-center p-6">
      <div className="glass rounded-xl p-12 text-center max-w-md w-full">
        <p className="font-numeric text-8xl font-black text-primary-500/30 leading-none mb-4">
          404
        </p>
        <h1 className="text-2xl font-bold text-neutral-100 mb-2">
          Страница не найдена
        </h1>
        <p className="text-sm text-neutral-500 mb-8">
          Объявление удалено или адрес указан неверно.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/search"
            className="px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
          >
            К поиску
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg glass hover:bg-white/10 text-neutral-300 text-sm font-medium transition-colors"
          >
            Аналитика
          </Link>
        </div>
      </div>
    </div>
  );
}
