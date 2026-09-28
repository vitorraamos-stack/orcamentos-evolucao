import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InstallationTeam, TeamMember } from "../types";

type Profile = { id: string; name?: string | null; email?: string | null; role?: string | null };
export function InstallationTeamDialog({ open, onOpenChange, team, members, profiles, onSave }: {
  open: boolean; onOpenChange: (value: boolean) => void; team: InstallationTeam | null;
  members: TeamMember[]; profiles: Profile[];
  onSave: (team: { id?: string; name: string; active: boolean; defaultVehicle?: string; notes?: string }, members: Array<{ userId: string; isLead: boolean }>) => Promise<void>;
}) {
  const [name, setName] = useState(""); const [active, setActive] = useState(true);
  const [vehicle, setVehicle] = useState(""); const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]); const [lead, setLead] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; const own = team ? members.filter(m => m.team_id === team.id) : [];
    setName(team?.name ?? ""); setActive(team?.active ?? true); setVehicle(team?.default_vehicle_label ?? ""); setNotes(team?.notes ?? "");
    setSelected(own.map(m => m.user_id)); setLead(own.find(m => m.is_lead)?.user_id ?? "");
  }, [open, team, members]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>{team ? "Editar equipe" : "Nova equipe"}</DialogTitle></DialogHeader>
    <div className="grid gap-3">
      <div><Label>Nome da equipe *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativa</label>
      <div><Label>Veículo padrão</Label><Input value={vehicle} onChange={e => setVehicle(e.target.value)} /></div>
      <div><Label>Observações</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <fieldset className="space-y-2"><Label>Membros</Label>{profiles.map(p => <label className="flex gap-2 text-sm" key={p.id}>
        <input type="checkbox" checked={selected.includes(p.id)} onChange={e => { const next = e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id); setSelected(next); if (!next.includes(lead)) setLead(""); }} />
        {p.name || p.email || "Usuário"} <span className="text-muted-foreground">({p.role})</span>
      </label>)}</fieldset>
      <div><Label>Líder</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={lead} onChange={e => setLead(e.target.value)}><option value="">Sem líder</option>{profiles.filter(p => selected.includes(p.id)).map(p => <option value={p.id} key={p.id}>{p.name || p.email}</option>)}</select></div>
      {!selected.length && <p className="text-sm text-amber-600">Esta equipe não possui instaladores.</p>}
      <Button disabled={!name.trim() || busy} onClick={async () => { setBusy(true); try { await onSave({ id: team?.id, name: name.trim(), active, defaultVehicle: vehicle, notes }, selected.map(userId => ({ userId, isLead: userId === lead }))); onOpenChange(false); } finally { setBusy(false); } }}>{busy ? "Salvando…" : "Salvar equipe"}</Button>
    </div>
  </DialogContent></Dialog>;
}
