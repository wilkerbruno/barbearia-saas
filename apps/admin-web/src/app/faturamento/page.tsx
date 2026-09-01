"use client";

import React, { useEffect, useState } from "react";
import { centavosParaReais } from "@barbearia-saas/shared";
import { api } from "../../lib/api";

interface FaturaResumo {
  id: string;
  valorCentavos: number;
  vencimentoEm: string;
  status: string;
  metodoPagamento: string | null;
  assinatura: { barbearia: { nome: string } };
}

export default function FaturamentoPage() {
  const [faturas, setFaturas] = useState<FaturaResumo[]>([]);

  useEffect(() => {
    api.get<FaturaResumo[]>("/faturas").then((res) => setFaturas(res.data));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Faturamento</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Cobranças recorrentes das barbearias assinantes</p>

      <div style={{ border: "1px solid #DEDAD4", borderRadius: 14, background: "white", marginTop: 20, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Barbearia</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th>Método</th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 700 }}>{f.assinatura.barbearia.nome}</td>
                <td>{centavosParaReais(f.valorCentavos)}</td>
                <td>{new Date(f.vencimentoEm).toLocaleDateString("pt-BR")}</td>
                <td>{f.status}</td>
                <td>{f.metodoPagamento ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
