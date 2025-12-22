declare module 'papaparse' {
  export interface ParseResult<T> {
    data: T[];
    errors: Array<{ message: string }>;
  }
  
  export interface ParseOptions {
    header?: boolean;
    skipEmptyLines?: boolean;
  }
  
  export function parse<T>(file: File, options: ParseOptions): {
    complete: (callback: (results: ParseResult<T>) => void) => void;
    error: (callback: (error: Error) => void) => void;
  };
} 