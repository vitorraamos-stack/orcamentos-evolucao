import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import InstallationFeedbacksCard from "./InstallationFeedbacksCard";

const baseItem = {
  id: "1",
  order_key: "os_orders:1",
  source_type: "os_orders" as const,
  source_id: "abc",
  os_number: 123,
  sale_number: "V-1",
  client_name: "Cliente",
  title: "Título",
  feedback: "Tudo certo",
  created_by: null,
  created_at: new Date().toISOString(),
  finalized_at: new Date().toISOString(),
  reviewed: false,
  reviewed_at: null,
  reviewed_by: null,
  reviewed_by_email: null,
};

describe("InstallationFeedbacksCard", () => {
  it("aplica destaque laranja quando há feedbacks pendentes", () => {
    const html = renderToStaticMarkup(
      <InstallationFeedbacksCard items={[baseItem]} />
    );

    expect(html).toContain("animate-pulse");
    expect(html).toContain("Feedbacks Instalações");
  });

  it("não aplica destaque quando não há feedbacks", () => {
    const html = renderToStaticMarkup(<InstallationFeedbacksCard items={[]} />);

    expect(html).not.toContain("animate-pulse");
  });
});
