import type { OrderComment, UserOption } from "../types/orderDetail";

/**
 * The inserted row is already confirmed by the repository. Show it immediately
 * instead of invoking a tab loader that may read stale React state.
 * Keep the existing newest-first order and never duplicate a confirmed row.
 */
export function prependPublishedComment(
  comments: OrderComment[],
  published: OrderComment,
  author?: UserOption
): OrderComment[] {
  return [
    { ...published, user: published.user ?? author },
    ...comments.filter(comment => comment.id !== published.id),
  ];
}
