import { AppShell } from "@/components/layout/app-shell";
import { MonthGate } from "@/features/month";
import { VaultGate } from "@/features/vault";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <VaultGate>
      <MonthGate>
        <AppShell>{children}</AppShell>
      </MonthGate>
    </VaultGate>
  );
}
