import { Suspense } from "react";
import { SessionApp } from "@/components/session/SessionApp";
import { ToastProvider, Spinner } from "@/components/ui";

export default function Page({ params }: PageProps<"/s/[code]">) {
  return (
    <ToastProvider>
      <Suspense fallback={<FullscreenSpinner />}>
        {params.then(({ code }) => (
          <SessionApp code={code.toUpperCase()} />
        ))}
      </Suspense>
    </ToastProvider>
  );
}

function FullscreenSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center text-brand-600">
      <Spinner className="size-8" />
    </div>
  );
}
