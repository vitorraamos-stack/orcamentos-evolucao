import HubOSBoard from "@/modules/hub-os/HubOSBoard"
import { PROD_COLUMNS } from "@/modules/hub-os/constants"

export default function HubOSProducao() {
  return (
    <HubOSBoard
      board="producao"
      columns={PROD_COLUMNS}
      title="Hub OS — Produção"
      subtitle="Controle o fluxo de produção e logística."
    />
  )
}
