import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  collapsed?: boolean;
}

export const SalgatudoLogo = ({ className, collapsed = false }: Props) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-primary shadow-orange-sm">
        <span className="text-lg font-extrabold text-primary-foreground">S</span>
      </div>
      {!collapsed && (
        <span className="text-xl font-extrabold tracking-tight text-foreground">
          Salga<span className="text-primary">Tudo</span>
        </span>
      )}
    </div>
  );
};
