import { Button } from "@/components/ui/button";
import type { OsOrderLayoutAsset } from "@/features/hubos/types";
export function OrderFilesTab({ assets, loading, error, onOpen }: { assets: OsOrderLayoutAsset[]; loading: boolean; error: string | null; onOpen: (asset: OsOrderLayoutAsset) => void }) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando arquivos…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!assets.length) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum arquivo disponível.</p>;
  return <div className="grid gap-3 sm:grid-cols-2">{assets.map(asset => <div key={asset.id} className="flex items-center gap-3 rounded-lg border p-4"><div className="min-w-0 flex-1"><p className="truncate font-medium">{asset.original_name ?? asset.object_path.split("/").pop()}</p><p className="text-xs text-muted-foreground">{asset.asset_type} · {asset.size_bytes ? `${Math.ceil(asset.size_bytes / 1024)} KB` : "Tamanho indisponível"}</p></div><Button size="sm" variant="outline" onClick={() => onOpen(asset)}>Abrir</Button></div>)}</div>;
}

