import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4", className)}
      {...props}
    />
  );
}
