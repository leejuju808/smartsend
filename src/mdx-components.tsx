import * as React from "react";

export function useMDXComponents(components: any) {
  return {
    h1: (props: any) => <h1 className="text-3xl font-bold tracking-tight mt-6 mb-4" {...props} />,
    h2: (props: any) => <h2 className="text-2xl font-semibold mt-8 mb-3" id={slugify(props.children)} {...props} />,
    h3: (props: any) => <h3 className="text-xl font-semibold mt-6 mb-2" id={slugify(props.children)} {...props} />,
    p: (props: any) => <p className="leading-7 my-3 text-[15px] text-muted-foreground" {...props} />,
    ul: (props: any) => <ul className="list-disc pl-6 my-3 space-y-1" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-6 my-3 space-y-1" {...props} />,
    code: (props: any) => <code className="bg-muted rounded px-1.5 py-0.5 text-sm" {...props} />,
    pre: (props: any) => (
      <pre className="bg-muted border rounded-lg p-3 overflow-x-auto text-sm my-4" {...props} />
    ),
    table: (props: any) => <table className="w-full text-sm border rounded-lg overflow-hidden my-4" {...props} />,
    thead: (props: any) => <thead className="bg-muted/60 text-left" {...props} />,
    th: (props: any) => <th className="px-3 py-2 font-semibold border-b" {...props} />,
    td: (props: any) => <td className="px-3 py-2 border-b align-top" {...props} />,
    a: (props: any) => <a className="text-primary underline underline-offset-4" {...props} />,
    blockquote: (props: any) => (
      <blockquote className="border-l-4 pl-4 italic text-muted-foreground my-3" {...props} />
    ),
    ...components,
  };
}

function slugify(children: any) {
  const text = Array.isArray(children) ? children.join(" ") : String(children ?? "");
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}


