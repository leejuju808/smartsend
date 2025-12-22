export default function Success({ searchParams }: { searchParams: { email?: string } }) {
  return (
    <div className="p-10 max-w-xl mx-auto text-center">
      <h1 className="text-2xl font-semibold mb-2">You're unsubscribed</h1>
      <p className="text-muted-foreground">We've removed {searchParams.email ?? "your email"} from future messages.</p>
    </div>
  );
}

