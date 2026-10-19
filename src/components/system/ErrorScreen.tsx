"use client";

// What a visitor sees when a page fails while loading or running: a calm terminal-style notice,
// a Retry button and a way home. Shared by app/error.tsx and app/global-error.tsx.

import { useEffect } from "react";
import { RequestedPath } from "./RequestedPath";
import { CommandLink, primaryCommand, Prompt, SystemScreen } from "./SystemScreen";

export type ErrorBoundaryProps = { error: Error & { digest?: string }; retry: () => void };

export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemScreen
      status="HALTED"
      command={
        <>
          GET <RequestedPath />
        </>
      }
      title="ERROR: RUNTIME_EXCEPTION"
      spokenTitle="Error: something went wrong"
      rows={[
        ["Status", "Execution halted"],
        // The digest matches the server's log line; the message itself stays private.
        ...(error.digest ? [["Trace ID", error.digest] as [string, string]] : []),
      ]}
      actions={
        <>
          <button type="button" onClick={() => retry()} className={primaryCommand}>
            <Prompt>Retry execution</Prompt>
          </button>
          <CommandLink href="/">Back to home</CommandLink>
        </>
      }
    >
      <title>Something went wrong — ProductRadar</title>
      <p>Something went wrong while loading this page. Trying again usually fixes it; if it doesn&apos;t, wait a minute and retry.</p>
    </SystemScreen>
  );
}
