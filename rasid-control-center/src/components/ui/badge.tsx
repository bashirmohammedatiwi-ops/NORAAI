import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('chip border border-border bg-secondary/60 text-foreground', className)}
      {...props}
    />
  );
}
