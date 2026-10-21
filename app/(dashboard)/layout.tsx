import { AppShell } from "@/components/app-shell";
import { DataProvider } from "@/components/data-provider";

/** Signed-in area. The proxy has already checked the session before anything here renders. */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
