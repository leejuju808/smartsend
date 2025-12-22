 "use client";

 import * as React from "react";

 export type LibraryDiffChangedEntry = {
   path: string;
   from: unknown;
   to: unknown;
 };

 export type LibraryDiff = {
   added?: string[];
   removed?: string[];
   changed?: LibraryDiffChangedEntry[];
 };

 type DiffViewerProps = {
   diff: LibraryDiff | null | undefined;
 };

 export function DiffViewer({ diff }: DiffViewerProps) {
   if (!diff) {
     return <div className="text-sm text-muted-foreground">No diff data</div>;
   }

   const { added = [], removed = [], changed = [] } = diff;

   if (!added.length && !removed.length && !changed.length) {
     return <div className="text-sm text-muted-foreground">No differences detected.</div>;
   }

   return (
     <div className="space-y-4 text-xs font-mono">
       {added.length > 0 && (
         <section>
           <header className="mb-1 font-semibold text-green-600">Added</header>
           <ul className="list-disc space-y-1 pl-4">
             {added.map((key) => (
               <li key={key} className="text-green-700">
                 {key}
               </li>
             ))}
           </ul>
         </section>
       )}

       {removed.length > 0 && (
         <section>
           <header className="mb-1 font-semibold text-red-600">Removed</header>
           <ul className="list-disc space-y-1 pl-4">
             {removed.map((key) => (
               <li key={key} className="text-red-700">
                 {key}
               </li>
             ))}
           </ul>
         </section>
       )}

       {changed.length > 0 && (
         <section>
           <header className="mb-1 font-semibold text-yellow-600">Changed</header>
           <ul className="list-disc space-y-2 pl-4">
             {changed.map((entry) => (
               <li key={entry.path} className="space-y-1 text-yellow-700">
                 <div className="font-semibold">{entry.path}</div>
                 <div className="flex flex-col gap-1 pl-3">
                   <div className="rounded bg-red-50/80 px-2 py-1 text-red-600 line-through">
                     Old: {JSON.stringify(entry.from)}
                   </div>
                   <div className="rounded bg-green-50/80 px-2 py-1 text-green-600">
                     New: {JSON.stringify(entry.to)}
                   </div>
                 </div>
               </li>
             ))}
           </ul>
         </section>
       )}
     </div>
   );
 }







