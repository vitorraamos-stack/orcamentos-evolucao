import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useBoardRealtime(onRefresh: () => void) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(onRefresh, 350);
    };
    const channel = supabase.channel(
      `operational-board-${crypto.randomUUID()}`
    );
    for (const table of ["os_orders", "os_order_assignees", "os_order_items"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refreshSoon
      );
    }
    channel.subscribe();
    const visible = () => {
      if (document.visibilityState === "visible") refreshSoon();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [onRefresh]);
}
