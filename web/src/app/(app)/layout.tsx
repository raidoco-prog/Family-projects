import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/onboarding");

  return (
    <div className="mx-auto flex h-dvh max-w-[460px] flex-col border-x border-rule bg-ground">
      <RegisterServiceWorker />
      <TopBar session={session} />
      <main className="flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4 pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
