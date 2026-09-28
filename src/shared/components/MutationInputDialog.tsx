import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
export function MutationInputDialog({ open, onOpenChange, title, label, required = false, confirmLabel, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; label: string; required?: boolean; confirmLabel: string; onConfirm: (value: string) => Promise<void> }) {
  const [value, setValue] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setValue(""); }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><Label>{label}{required && " *"}</Label><Textarea value={value} onChange={e => setValue(e.target.value)} /><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant={required ? "destructive" : "default"} disabled={busy || (required && !value.trim())} onClick={async () => { setBusy(true); try { await onConfirm(value.trim()); onOpenChange(false); } finally { setBusy(false); } }}>{confirmLabel}</Button></div></DialogContent></Dialog>;
}
