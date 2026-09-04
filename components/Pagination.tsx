import Link from 'next/link';

/** Previous / next links around a page counter. Server-renderable: the caller builds the hrefs so filters survive. */
export function Pagination({
    page,
    pageSize,
    total,
    href,
}: {
    page: number;
    pageSize: number;
    total: number;
    href: (page: number) => string;
}) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    // Still shown past the last page (a stale link, a filter that emptied the list): the way back is "Previous".
    if (pages <= 1 && page <= 1) return null;

    const linkClass = 'px-3 py-1 rounded-md border border-border text-sm no-underline';
    const disabledClass = 'opacity-40 pointer-events-none';

    return (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-muted-foreground">
            <span>
                Page {page} of {pages} · {total} backup{total !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
                <Link
                    href={href(page - 1)}
                    className={`${linkClass} ${page <= 1 ? disabledClass : 'hover:bg-muted'}`}
                    aria-disabled={page <= 1}
                >
                    Previous
                </Link>
                <Link
                    href={href(page + 1)}
                    className={`${linkClass} ${page >= pages ? disabledClass : 'hover:bg-muted'}`}
                    aria-disabled={page >= pages}
                >
                    Next
                </Link>
            </div>
        </div>
    );
}
