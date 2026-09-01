"use client";

import React, { useEffect, useState } from "react";
import { Plano, centavosParaReais } from "@barbearia-saas/shared";
import { api } from "../../lib/api";

// Onde o SaaS "faz os valores": edita o preço de cada plano cobrado das
// barbearias assinantes.
export default function PlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valor, setValor] = useState("");

  function carregar() {
    api.get<Plano[]>("/planos/todos").then((res) => setPlanos(res.data));
  }

  useEffect(() => {
    carregar();
  }, []);

  function iniciarEdicao(plano: Plano) {
    setEditandoId(plano.id);
    setValor((plano.precoCentavos / 100).toFixed(2));
  }

  async function salvar(id: string) {
    const precoCentavos = Math.round(parseFloat(valor.replace(",", ".")) * 100);
    if (Number.isNaN(precoCentavos)) return;
    await api.patch(`/planos/${id}`, { precoCentavos });
    setEditandoId(null);
    carregar();
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Planos e preços</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Defina os valores cobrados de cada barbearia assinante</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 24 }}>
        {planos.map((plano) => (
          <div key={plano.id} style={{ border: "1px solid #DEDAD4", borderRadius: 16, padding: 22, background: "white" }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{plano.nome}</div>

            {editandoId === plano.id ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  style={{ fontSize: 20, fontWeight: 800, border: "1.5px solid #C1652E", borderRadius: 8, padding: "4px 8px", width: 100 }}
                />
                <button onClick={() => salvar(plano.id)} style={{ border: "none", background: "#C1652E", color: "white", borderRadius: 9, padding: "9px 0", fontWeight: 700, cursor: "pointer" }}>
                  Salvar valor
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {centavosParaReais(plano.precoCentavos)}
                  <span style={{ fontSize: 13, color: "#837A73", fontWeight: 600 }}>/mês</span>
                </div>
                <button
                  onClick={() => iniciarEdicao(plano)}
                  style={{ border: "1px solid #DEDAD4", background: "white", borderRadius: 9, padding: "9px 0", width: "100%", marginTop: 8, fontWeight: 700, cursor: "pointer" }}
                >
                  Editar valor
                </button>
              </>
            )}

            <ul style={{ marginTop: 14, paddingLeft: 18, fontSize: 12.5, color: "#837A73" }}>
              {plano.recursos.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
