"use client";

import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { centavosParaReais } from "@barbearia-saas/shared";

interface AssinaturaResumo {
  id: string;
  status: string;
  barbearia: { nome: string };
  plano: { nome: string; precoCentavos: number };
}

// Visão geral: MRR calculado a partir das assinaturas ativas (soma do preço do
// plano de cada uma). Métricas mais ricas (churn, séries históricas) exigem
// guardar snapshots mensais — próximo passo natural aqui.
export default function DashboardPage() {
  const [assinaturas, setAssinaturas] = useState<AssinaturaResumo[]>([]);

  useEffect(() => {
    api.get<AssinaturaResumo[]>("/assinaturas").then((res) => setAssinaturas(res.data));
  }, []);

  const ativas = assinaturas.filter((a) => a.status === "ATIVA");
  const mrrCentavos = ativas.reduce((soma, a) => soma + a.plano.precoCentavos, 0);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Visão geral</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Desempenho da plataforma entre todas as barbearias assinantes</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 28 }}>
        <Card label="MRR (receita mensal)" value={centavosParaReais(mrrCentavos)} />
        <Card label="Barbearias assinantes" value={String(assinaturas.length)} />
        <Card label="Assinaturas ativas" value={String(ativas.length)} />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #DEDAD4", borderRadius: 14, padding: 18, background: "white" }}>
      <div style={{ fontSize: 12, color: "#837A73" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}
