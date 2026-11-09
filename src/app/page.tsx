import { Home } from "@/components/Home";
import { ToastProvider } from "@/components/ui";

export default function Page() {
  return (
    <ToastProvider>
      <Home />
    </ToastProvider>
  );
}
