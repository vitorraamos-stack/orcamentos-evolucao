/**
 * Tracks in-flight reads for one OS view. It does not cache responses:
 * collaborators may update the underlying records at any time.
 */
export type OrderReadTicket = Readonly<{
  orderId: string;
  resource: string;
  generation: number;
  sequence: number;
}>;

export function createOrderReadCoordinator() {
  let activeOrderId: string | null = null;
  let generation = 0;
  let sequence = 0;
  const pending = new Map<string, OrderReadTicket>();

  const isCurrent = (ticket: OrderReadTicket) =>
    activeOrderId === ticket.orderId &&
    generation === ticket.generation &&
    pending.get(ticket.resource) === ticket;

  return {
    activate(orderId: string | null) {
      activeOrderId = orderId;
      generation += 1;
      pending.clear();
    },
    invalidate() {
      activeOrderId = null;
      generation += 1;
      pending.clear();
    },
    begin(orderId: string, resource: string, replace = false): OrderReadTicket | null {
      if (!orderId || orderId !== activeOrderId) return null;
      if (!replace && pending.has(resource)) return null;
      const ticket: OrderReadTicket = {
        orderId,
        resource,
        generation,
        sequence: ++sequence,
      };
      pending.set(resource, ticket);
      return ticket;
    },
    isCurrent,
    isActive(orderId: string) { return activeOrderId === orderId; },
    finish(ticket: OrderReadTicket) {
      if (isCurrent(ticket)) pending.delete(ticket.resource);
    },
  };
}
