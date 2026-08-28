import * as React from "react";
import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
const TableHeader = ({ className, ...p }: React.ComponentProps<"thead">) => <thead className={cn("[&_tr]:border-b", className)} {...p} />;
const TableBody = ({ className, ...p }: React.ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
const TableRow = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("border-b transition-colors data-[state=selected]:bg-muted/60 hover:bg-muted/40", className)} {...p} />;
const TableHead = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("text-muted-foreground h-8 px-2.5 text-left align-middle text-[10px] font-semibold tracking-wide uppercase whitespace-nowrap", className)} {...p} />
);
const TableCell = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("h-9 px-2.5 align-middle text-[13px] whitespace-nowrap", className)} {...p} />;
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
