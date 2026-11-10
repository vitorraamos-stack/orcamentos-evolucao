import { isSameTabOrderActivation } from "../centralReturnContext";

const INTERACTIVE_TARGETS = 'a, button, input, select, textarea, summary, [role="button"], [role="link"], [contenteditable="true"]';

type RowClick = {
  defaultPrevented: boolean;
  nativeEvent: Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;
  target: EventTarget | null;
};

/** Only unmodified clicks on non-interactive row space should open an OS.
 * Individual links retain browser new-tab behavior and menu buttons keep their own actions.
 */
export function shouldOpenOrderRow(event: RowClick, selectedText = ""): boolean {
  if (event.defaultPrevented || !isSameTabOrderActivation(event.nativeEvent)) return false;
  const element = event.target as Element | null;
  if (typeof element?.closest === "function" && element.closest(INTERACTIVE_TARGETS)) return false;
  return selectedText.trim().length === 0;
}
