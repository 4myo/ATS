import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="text-9xl font-black text-muted">404</h1>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Page not found</h2>
      <p className="mt-4 text-base text-muted-foreground">Sorry, we couldn't find the page you're looking for.</p>
      <div className="mt-8">
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go back home
        </Link>
      </div>
    </div>
  );
}
