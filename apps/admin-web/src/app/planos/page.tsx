"use client";

import React, { useEffect, useState } from "react";
import { Plano, centavosParaReais } from "@barbearia-saas/shared";
import { api } from "../../lib/api";

const NOVO_PLANO_VAZIO = { nome: "", precoReais: "", limiteFuncionarios: "", recursos: "" };

// Onde o SaaS "faz os valores": cria planos novos, edita o preço de um plano
// existente e ativa/desativa planos (um plano desativado some da tela de
// onboarding, mas continua valendo pra quem já está nele).
export default function PlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [novoPlano, setNovoPlano] = useState(NOVO_PLANO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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

  async function alternarAtivo(plano: Plano) {
    await api.patch(`/planos/${plano.id}`, { ativo: !plano.ativo });
    carregar();
  }

  async function criarPlano(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const precoCentavos = Math.round(parseFloat(novoPlano.precoReais.replace(",", ".")) * 100);
    if (!novoPlano.nome.trim()) return setErro("Digite o nome do plano.");
    if (Number.isNaN(precoCentavos) || precoCentavos <= 0) return setErro("Digite um preço válido (ex: 79,00).");

    setSalvando(true);
    try {
      await api.post("/planos", {
        nome: novoPlano.nome.trim(),
        precoCentavos,
        limiteFuncionarios: novoPlano.limiteFuncionarios.trim() ? parseInt(novoPlano.limiteFuncionarios, 10) : undefined,
        recursos: novoPlano.recursos
          .split("\n")
          .map((r) => r.trim())
          .filter(Boolean),
      });
      setNovoPlano(NOVO_PLANO_VAZIO);
      setFormAberto(false);
      carregar();
    } catch (err: any) {
      setErro(err?.response?.data?.message ?? "Não foi possível criar o plano.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Planos e preços</h1>
          <p style={{ color: "#837A73", fontSize: 13 }}>Defina os valores cobrados de cada barbearia assinante</p>
        </div>
        <button onClick={() => setFormAberto((v) => !v)} style={btnPrimary}>
          {formAberto ? "Cancelar" : "+ Novo plano"}
        </button>
      </div>

      {formAberto && (
        <form onSubmit={criarPlano} style={{ ...cardStyle, marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {erro && <div style={{ color: "#C1442E", fontSize: 13 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              placeholder="Nome (ex: Avançado)"
              value={novoPlano.nome}
              onChange={(e) => setNovoPlano((p) => ({ ...p, nome: e.target.value }))}
              style={{ ...inputStyle, flex: 2 }}
            />
            <input
              placeholder="Preço mensal (R$)"
              value={novoPlano.precoReais}
              onChange={(e) => setNovoPlano((p) => ({ ...p, precoReais: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder="Limite funcionários (vazio = ilimitado)"
              value={novoPlano.limiteFuncionarios}
              onChange={(e) => setNovoPlano((p) => ({ ...p, limiteFuncionarios: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <textarea
            placeholder={"Recursos exibidos (um por linha)\nEx: Agenda e financeiro\nRelatórios avançados"}
            value={novoPlano.recursos}
            onChange={(e) => setNovoPlano((p) => ({ ...p, recursos: e.target.value }))}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
          <button type="submit" disabled={salvando} style={{ ...btnPrimary, width: 160 }}>
            {salvando ? "Criando…" : "Criar plano"}
          </button>
        </form>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 24 }}>
        {planos.map((plano) => (
          <div key={plano.id} style={{ ...cardStyle, opacity: plano.ativo ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{plano.nome}</div>
              {!plano.ativo && <span style={badgeStyle}>Desativado</span>}
            </div>

            {editandoId === plano.id ? (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  style={{ fontSize: 20, fontWeight: 800, border: "1.5px solid #C1652E", borderRadius: 8, padding: "4px 8px", width: 100 }}
                />
                <button onClick={() => salvar(plano.id)} style={btnPrimary}>
                  Salvar valor
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {centavosParaReais(plano.precoCentavos)}
                  <span style={{ fontSize: 13, color: "#837A73", fontWeight: 600 }}>/mês</span>
                </div>
                <div style={{ fontSize: 12, color: "#837A73", marginTop: 2 }}>
                  {plano.limiteFuncionarios == null ? "Funcionários ilimitados" : `Até ${plano.limiteFuncionarios} funcionário(s)`}
                </div>
                <button onClick={() => iniciarEdicao(plano)} style={{ ...btnSecondary, width: "100%", marginTop: 10 }}>
                  Editar valor
                </button>
              </>
            )}

            <button onClick={() => alternarAtivo(plano)} style={{ ...btnLink, marginTop: 8 }}>
              {plano.ativo ? "Desativar plano" : "Reativar plano"}
            </button>

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

const cardStyle: React.CSSProperties = { border: "1px solid #DEDAD4", borderRadius: 16, padding: 22, background: "white" };
const btnBase: React.CSSProperties = { border: "none", borderRadius: 9, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { ...btnBase, background: "#C1652E", color: "white" };
const btnSecondary: React.CSSProperties = { ...btnBase, border: "1px solid #DEDAD4", background: "white" };
const btnLink: React.CSSProperties = { ...btnBase, background: "none", color: "#837A73", padding: "4px 0", textAlign: "left" };
const inputStyle: React.CSSProperties = { border: "1px solid #DEDAD4", borderRadius: 9, padding: "10px 12px", fontSize: 13 };
const badgeStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#837A73", background: "#F1EEE9", padding: "3px 8px", borderRadius: 999 };
