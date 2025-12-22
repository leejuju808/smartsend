export const useToast = () => ({
  toast: ({ description, variant }: { description: string; variant?: "destructive" | string }) =>
    console.log(variant === "destructive" ? "ERROR:" : "INFO:", description),
});


