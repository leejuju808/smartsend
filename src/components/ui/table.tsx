import * as React from "react";
export function Table({ children }: { children: React.ReactNode }) { return <table className="w-full text-sm">{children}</table>; }
export function THead({ children }: { children: React.ReactNode }) { return <thead className="bg-muted/50">{children}</thead>; }
export function TBody({ children }: { children: React.ReactNode }) { return <tbody>{children}</tbody>; }
export function TR({ children }: { children: React.ReactNode }) { return <tr className="border-b">{children}</tr>; }
export function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={"text-left font-medium px-3 py-2 " + (className ?? "")}>{children}</th>;
}
export function TD({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) { return <td colSpan={colSpan} className={"px-3 py-2 " + (className ?? "")}>{children}</td>; }