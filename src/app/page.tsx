import { ProductDashboard } from "@/components/dashboard/product-dashboard";

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold tracking-tight text-indigo-700 dark:text-indigo-300">ProductRadar</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-white">
            Product intelligence
          </h1>
          <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Every score is calculated from sourced, timestamped evidence. Open a product to see exactly which evidence
            each score is based on.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <ProductDashboard />
      </main>
    </div>
  );
}
