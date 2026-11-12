// Navigation for the pages, on React Router. The hooks keep the shapes the
// pages were written against: useRouter().push and .refresh, useParams,
// usePathname, and useSearchParams returning the params alone.

import { forwardRef, type AnchorHTMLAttributes } from "react";
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams as useRouterParams,
  useRevalidator,
  useSearchParams as useRouterSearchParams,
} from "react-router";

export function useRouter() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    /** Load the current page's data again. */
    refresh: () => void revalidator.revalidate(),
  };
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRouterParams() as T;
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0];
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

/**
 * A link to a page of the app. Links to /api/* are file downloads, so they are
 * plain anchors that the browser follows.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, ...props }, ref) {
  if (href.startsWith("/api/") || /^[a-z]+:/i.test(href)) return <a ref={ref} href={href} {...props} />;
  return <RouterLink ref={ref} to={href} {...props} />;
});
