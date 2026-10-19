import type { Metadata } from "next";
import { RequestedPath } from "@/components/system/RequestedPath";
import { CommandLink, SystemScreen } from "@/components/system/SystemScreen";

export const metadata: Metadata = { title: "Page not found — ProductRadar" };

// Every missing address, and every notFound() (for example a Dossier link for a product that's gone).
export default function NotFound() {
  return (
    <SystemScreen
      status="404"
      command={
        <>
          GET <RequestedPath />
        </>
      }
      title="ERROR 404: ROUTE_NOT_FOUND"
      spokenTitle="Error 404: page not found"
      rows={[
        ["Status", "404 Not Found"],
        ["Cause", "An old or mistyped link, or a product that's no longer listed."],
      ]}
      actions={
        <>
          <CommandLink href="/" primary>
            Back to home
          </CommandLink>
          <CommandLink href="/dashboard">Open dashboard</CommandLink>
        </>
      }
    >
      <p>We couldn&apos;t find that page. Check the address, or carry on from one of these.</p>
    </SystemScreen>
  );
}
