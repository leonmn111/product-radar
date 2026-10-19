"use client"; // error boundaries must be Client Components

import { type ErrorBoundaryProps, ErrorScreen } from "@/components/system/ErrorScreen";

// Catches anything that fails while a page renders or runs. The root layout (and its footer) stays;
// Retry re-fetches and re-renders the page.
export default function PageError({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} retry={retry} />;
}
