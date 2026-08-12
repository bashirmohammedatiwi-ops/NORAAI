import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none ring-primary focus:ring-2',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
