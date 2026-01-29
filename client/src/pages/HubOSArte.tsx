import HubOSBoard from "@/modules/hub-os/HubOSBoard"
import { ART_COLUMNS } from "@/modules/hub-os/constants"

export default function HubOSArte() {
  return (
    <HubOSBoard
      board="arte"
      columns={ART_COLUMNS}
      title="Hub OS — Arte"
      subtitle="Acompanhe os pedidos em criação de arte."
    />
  )
}
