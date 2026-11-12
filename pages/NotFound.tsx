import { Link } from "@/lib/client/navigation";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <h1 className="text-[17px] font-semibold text-[color:var(--color-ink)]">Page not found</h1>
        <Link href="/" className="mt-2 inline-block text-[13px] text-[color:var(--color-carrot)] hover:underline">
          Go to pipelines
        </Link>
      </div>
    </main>
  );
}
