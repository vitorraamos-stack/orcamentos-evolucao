import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import type { LogisticType, OsOrder } from "./types"

type BoardType = "arte" | "producao"

type HubOSBoardProps = {
  board: BoardType
  columns: string[]
  title: string
  subtitle: string
}

const logisticLabels: Record<LogisticType, string> = {
  retirada: "Retirada",
  entrega: "Entrega",
  instalacao: "Instalação",
}

const getDefaultTitle = (order: OsOrder) =>
  order.title?.trim() || `${order.sale_number} - ${order.client_name}`

export default function HubOSBoard({ board, columns, title, subtitle }: HubOSBoardProps) {
  const { isAdmin } = useAuth()
  const [orders, setOrders] = useState<OsOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<OsOrder | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [editingDescription, setEditingDescription] = useState("")
  const [editingDeliveryDate, setEditingDeliveryDate] = useState("")
  const [editingLogisticType, setEditingLogisticType] = useState<LogisticType>("retirada")
  const [editingAddress, setEditingAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadOrders = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("os_orders")
      .select("*")
      .order("updated_at", { ascending: false })

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }
    setOrders((data || []) as OsOrder[])
    setLoading(false)
  }

  useEffect(() => {
    loadOrders()
  }, [])

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const status = board === "arte" ? order.art_status : order.prod_status
      if (!status || !columns.includes(status)) return false
      if (board === "arte" && order.prod_status) return false
      return true
    })
  }, [board, columns, orders])

  const ordersByColumn = useMemo(() => {
    return columns.reduce<Record<string, OsOrder[]>>((acc, column) => {
      acc[column] = filteredOrders.filter((order) =>
        board === "arte" ? order.art_status === column : order.prod_status === column
      )
      return acc
    }, {})
  }, [board, columns, filteredOrders])

  const openOrder = (order: OsOrder) => {
    setSelectedOrder(order)
    setEditingTitle(getDefaultTitle(order))
    setEditingDescription(order.description ?? "")
    setEditingDeliveryDate(order.delivery_date ?? "")
    setEditingLogisticType(order.logistic_type ?? "retirada")
    setEditingAddress(order.address ?? "")
  }

  const closeModal = () => {
    setSelectedOrder(null)
    setEditingTitle("")
    setEditingDescription("")
    setEditingDeliveryDate("")
    setEditingLogisticType("retirada")
    setEditingAddress("")
    setSaving(false)
    setMoving(false)
    setDeleting(false)
  }

  const logisticNeedsAddress = editingLogisticType === "instalacao"
  const canSave =
    editingTitle.trim().length > 0 &&
    editingLogisticType !== "" &&
    (!logisticNeedsAddress || editingAddress.trim().length > 0)

  const handleSave = async () => {
    if (!selectedOrder || !canSave) return
    setSaving(true)
    const addressValue =
      editingLogisticType === "instalacao" || editingLogisticType === "entrega"
        ? editingAddress.trim() || null
        : null

    const { data, error } = await supabase
      .from("os_orders")
      .update({
        title: editingTitle.trim(),
        description: editingDescription.trim() || null,
        delivery_date: editingDeliveryDate || null,
        logistic_type: editingLogisticType,
        address: addressValue,
      })
      .eq("id", selectedOrder.id)
      .select("*")
      .single()

    if (error) {
      console.error(error)
      setSaving(false)
      return
    }

    const updated = data as OsOrder
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)))
    setSaving(false)
    closeModal()
  }

  const handleDelete = async () => {
    if (!selectedOrder || !isAdmin) return
    setDeleting(true)
    const { error } = await supabase.from("os_orders").delete().eq("id", selectedOrder.id)
    if (error) {
      console.error(error)
      setDeleting(false)
      return
    }
    setOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id))
    closeModal()
  }

  const handleMoveToProduction = async () => {
    if (!selectedOrder) return
    setMoving(true)
    const nextStatus = "Produção (Fila)"
    const { data, error } = await supabase
      .from("os_orders")
      .update({
        prod_status: nextStatus,
      })
      .eq("id", selectedOrder.id)
      .select("*")
      .single()

    if (error) {
      console.error(error)
      setMoving(false)
      return
    }

    const updated = data as OsOrder
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)))
    closeModal()
  }

  const handleBackToArte = async () => {
    if (!selectedOrder || !isAdmin) return
    setMoving(true)
    const { data, error } = await supabase
      .from("os_orders")
      .update({
        art_status: "Caixa de Entrada",
        prod_status: null,
      })
      .eq("id", selectedOrder.id)
      .select("*")
      .single()

    if (error) {
      console.error(error)
      setMoving(false)
      return
    }

    const updated = data as OsOrder
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)))
    closeModal()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando cards...</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div key={column} className="min-w-[280px] max-w-[320px] flex-1 space-y-3">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    {column}
                    <span className="text-xs text-muted-foreground">
                      {ordersByColumn[column]?.length ?? 0}
                    </span>
                  </CardTitle>
                </CardHeader>
              </Card>
              <div className="space-y-3">
                {(ordersByColumn[column] || []).map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => openOrder(order)}
                    className="w-full text-left"
                  >
                    <Card className="transition hover:border-primary cursor-pointer">
                      <CardContent className="space-y-2 p-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{getDefaultTitle(order)}</p>
                          <p className="text-xs text-muted-foreground">{order.client_name}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{logisticLabels[order.logistic_type]}</Badge>
                          {order.letra_caixa && <Badge variant="outline">Letra Caixa</Badge>}
                          {order.reproducao && <Badge variant="destructive">Reprodução</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                ))}
                {(ordersByColumn[column] || []).length === 0 && (
                  <Card className="border-dashed">
                    <CardContent className="p-4 text-xs text-muted-foreground">
                      Nenhum card nesta coluna.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar OS</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="grid gap-4">
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Descrição detalhada</Label>
                <Textarea
                  value={editingDescription}
                  onChange={(event) => setEditingDescription(event.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Data de entrega</Label>
                  <Input
                    type="date"
                    value={editingDeliveryDate}
                    onChange={(event) => setEditingDeliveryDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Logística</Label>
                  <RadioGroup
                    value={editingLogisticType}
                    onValueChange={(value) => {
                      const nextValue = value as LogisticType
                      setEditingLogisticType(nextValue)
                      if (nextValue === "retirada") {
                        setEditingAddress("")
                      }
                    }}
                    className="grid grid-cols-3 gap-2"
                  >
                    {(["retirada", "entrega", "instalacao"] as LogisticType[]).map((value) => (
                      <label key={value} className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value={value} />
                        {logisticLabels[value]}
                      </label>
                    ))}
                  </RadioGroup>
                  {logisticNeedsAddress && editingAddress.trim().length === 0 && (
                    <p className="text-xs text-destructive">
                      Endereço é obrigatório para instalação.
                    </p>
                  )}
                </div>
              </div>

              {(editingLogisticType === "instalacao" || editingLogisticType === "entrega") && (
                <div className="space-y-1">
                  <Label>Endereço</Label>
                  <Textarea
                    value={editingAddress}
                    onChange={(event) => setEditingAddress(event.target.value)}
                    placeholder="Rua, número, bairro, cidade..."
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {board === "arte" && (
                  <Button
                    variant="outline"
                    onClick={handleMoveToProduction}
                    disabled={moving}
                  >
                    Enviar para Produção
                  </Button>
                )}
                {board === "producao" && isAdmin && (
                  <Button
                    variant="outline"
                    onClick={handleBackToArte}
                    disabled={moving}
                  >
                    Voltar para Arte
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              {isAdmin && (
                <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                  Excluir
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeModal}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !canSave}>
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
