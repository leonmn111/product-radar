import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The link may be old, or the product may have been removed from the catalog.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:bg-purple-500 dark:text-zinc-950 dark:hover:bg-purple-400"
          >
            Go to the catalog
          </Link>
          <Link
            href="/"
            className="rounded-md px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:text-white dark:ring-zinc-700 dark:hover:bg-zinc-800"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
