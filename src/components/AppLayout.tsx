import { ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface Props {
  children: ReactNode;
  title?: string;
}

export const AppLayout = ({ children, title }: Props) => {
  return (
    <SidebarProvider>
      <AppSidebar />

      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
          <SidebarTrigger className="text-muted-foreground hover:text-primary" />
          {title && (
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
          )}
        </header>

        <main className="min-w-0 flex-1 animate-fade-in p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};
