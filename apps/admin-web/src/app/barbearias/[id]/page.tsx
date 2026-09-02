"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { centavosParaReais, Plano } from "@barbearia-saas/shared";
import { api } from "../../../lib/api";

interface FuncionarioResumo {
  id: string;
  cargo: string;
  ativo: boolean;
  usuario: { nome: string; email: string };
}

interface FaturaResumo {
  id: string;
  valorCentavos: number;
  vencimentoEm: string;
  status: string;
  metodoPagamento: string | null;
}

interface BarbeariaDetalhe {
  id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  criadoEm: string;
  notaMedia: number;
  totalAvaliacoes: number;
  funcionarios: FuncionarioResumo[];
  assinatura: {
    status: string;
    proximaCobrancaEm: string | null;
    plano: Plano;
    faturas: FaturaResumo[];
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Período de teste",
  ATIVA: "Ativa",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
};

// Detalhe de uma barbearia assinante: dados básicos, situação da assinatura
// (com suspender/reativar/cancelar e troca manual de plano), equipe e
// histórico de faturas — tudo que o suporte da plataforma precisa pra atender
// um chamado sem precisar mexer direto no banco.
export default function BarbeariaDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [barbearia, setBarbearia] = useState<BarbeariaDetalhe | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoSelecionado, setPlanoSelecionado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [barbeariaRes, planosRes] = await Promise.all([
      api.get<BarbeariaDetalhe>(`/barbearias/${id}`),
      api.get<Plano[]>("/planos/todos"),
    ]);
    setBarbearia(barbeariaRes.data);
    setPlanos(planosRes.data);
    setPlanoSelecionado(barbeariaRes.data.assinatura?.plano.id ?? "");
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function definirStatus(status: string) {
    setErro(null);
    setSalvando(true);
    try {
      await api.patch(`/assinaturas/${id}/status`, { status });
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível atualizar o status.");
    } finally {
      setSalvando(false);
    }
  }

  async function aplicarPlano() {
    if (!planoSelecionado) return;
    setErro(null);
    setSalvando(true);
    try {
      await api.patch(`/assinaturas/${id}/plano`, { planoId: planoSelecionado });
      carregar();
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? "Não foi possível trocar o plano.");
    } finally {
      setSalvando(false);
    }
  }

  if (!barbearia) return null;

  return (
    <div>
      <Link href="/barbearias" style={{ fontSize: 13, color: "#837A73" }}>
        ← Barbearias
      </Link>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{barbearia.nome}</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>
        {barbearia.endereco ?? "Sem endereço cadastrado"} {barbearia.telefone ? `· ${barbearia.telefone}` : ""}
      </p>
      <p style={{ color: "#837A73", fontSize: 12, marginTop: 2 }}>
        Assinante desde {new Date(barbearia.criadoEm).toLocaleDateString("pt-BR")} · {barbearia.notaMedia.toFixed(1)}★ (
        {barbearia.totalAvaliacoes} avaliações)
      </p>

      {erro && (
        <div style={{ marginTop: 16, color: "#C1442E", fontSize: 13, background: "#F7E9E6", padding: 10, borderRadius: 8 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 24 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Assinatura</div>
          {barbearia.assinatura ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{barbearia.assinatura.plano.nome}</div>
              <div style={{ fontSize: 13, color: "#837A73" }}>
                {centavosParaReais(barbearia.assinatura.plano.precoCentavos)}/mês
              </div>
              <div style={{ marginTop: 10, fontSize: 13 }}>
                Status: <strong>{STATUS_LABEL[barbearia.assinatura.status] ?? barbearia.assinatura.status}</strong>
              </div>
              {barbearia.assinatura.proximaCobrancaEm && (
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  Próxima cobrança: {new Date(barbearia.assinatura.proximaCobrancaEm).toLocaleDateString("pt-BR")}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <button disabled={salvando} onClick={() => definirStatus("ATIVA")} style={btnSecondary}>
                  Reativar
                </button>
                <button disabled={salvando} onClick={() => definirStatus("INADIMPLENTE")} style={btnSecondary}>
                  Suspender
                </button>
                <button disabled={salvando} onClick={() => definirStatus("CANCELADA")} style={btnDanger}>
                  Cancelar assinatura
                </button>
              </div>

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #DEDAD4" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#837A73", marginBottom: 8 }}>
                  Trocar plano manualmente (sem cobrança — use com cuidado)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={planoSelecionado} onChange={(e) => setPlanoSelecionado(e.target.value)} style={selectStyle}>
                    {planos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <button disabled={salvando} onClick={aplicarPlano} style={btnPrimary}>
                    Aplicar
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p style={{ color: "#837A73", fontSize: 13 }}>Sem assinatura.</p>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Equipe ({barbearia.funcionarios.length})</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {barbearia.funcionarios.length === 0 && <p style={{ color: "#837A73", fontSize: 13 }}>Nenhum funcionário cadastrado.</p>}
            {barbearia.funcionarios.map((f) => (
              <div key={f.id} style={{ fontSize: 13, opacity: f.ativo ? 1 : 0.5 }}>
                <strong>{f.usuario.nome}</strong> · {f.cargo}
                <div style={{ fontSize: 12, color: "#837A73" }}>{f.usuario.email}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Faturas</div>
        {!barbearia.assinatura || barbearia.assinatura.faturas.length === 0 ? (
          <p style={{ color: "#837A73", fontSize: 13 }}>Nenhuma fatura ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {barbearia.assinatura.faturas.map((f) => (
                <tr key={f.id}>
                  <td>{centavosParaReais(f.valorCentavos)}</td>
                  <td>{new Date(f.vencimentoEm).toLocaleDateString("pt-BR")}</td>
                  <td>{f.status}</td>
                  <td>{f.metodoPagamento ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 14,
  padding: 20,
  background: "white",
};

const btnBase: React.CSSProperties = {
  border: "none",
  borderRadius: 9,
  padding: "9px 14px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = { ...btnBase, background: "#C1652E", color: "white" };
const btnSecondary: React.CSSProperties = { ...btnBase, background: "#F1EEE9", color: "#2A2420" };
const btnDanger: React.CSSProperties = { ...btnBase, background: "#F7E9E6", color: "#C1442E" };
const selectStyle: React.CSSProperties = {
  border: "1px solid #DEDAD4",
  borderRadius: 9,
  padding: "9px 10px",
  fontSize: 13,
  flex: 1,
};
