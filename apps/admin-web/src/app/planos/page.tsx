"use client";

import React, { useEffect, useState } from "react";
import { Plano, TipoDesconto, calcularPrecoAnualCentavos, centavosParaReais } from "@barbearia-saas/shared";
import { api } from "../../lib/api";

const NOVO_PLANO_VAZIO = {
  nome: "",
  precoReais: "",
  limiteFuncionarios: "",
  recursos: "",
  descontoAnualTipo: TipoDesconto.PERCENTUAL as TipoDesconto,
  descontoAnualValor: "",
  atendimentoPrioritario: false,
  whatsappSuporte: "",
};

// Onde o SaaS "faz os valores": cria planos novos, edita o preço de um plano
// existente e ativa/desativa planos (um plano desativado some da tela de
// onboarding, mas continua valendo pra quem já está nele).
export default function PlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  // Edição do desconto anual — mesmo padrão de editandoId/valor acima, campo
  // separado porque os dois podem ser editados independentemente.
  const [editandoDescontoId, setEditandoDescontoId] = useState<string | null>(null);
  const [descontoTipo, setDescontoTipo] = useState<TipoDesconto>(TipoDesconto.PERCENTUAL);
  const [descontoValor, setDescontoValor] = useState("");
  // Edição do atendimento prioritário (WhatsApp) — mesmo padrão do desconto
  // anual acima: estado próprio porque é editado independentemente do resto.
  const [editandoSuporteId, setEditandoSuporteId] = useState<string | null>(null);
  const [suportePrioritario, setSuportePrioritario] = useState(false);
  const [suporteWhatsapp, setSuporteWhatsapp] = useState("");
  const [erroSuporte, setErroSuporte] = useState<string | null>(null);
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

  function iniciarEdicaoDesconto(plano: Plano) {
    setEditandoDescontoId(plano.id);
    setDescontoTipo(plano.descontoAnualTipo);
    setDescontoValor(
      plano.descontoAnualTipo === TipoDesconto.PERCENTUAL
        ? String(plano.descontoAnualValor)
        : (plano.descontoAnualValor / 100).toFixed(2),
    );
  }

  // descontoValor está em "unidade humana" (pontos percentuais, ou reais
  // quando VALOR_FIXO) — converte pra como o backend guarda (ver
  // Plano.descontoAnualValor no schema: percentual cru, ou centavos).
  async function salvarDesconto(id: string) {
    const bruto = parseFloat(descontoValor.replace(",", "."));
    if (Number.isNaN(bruto) || bruto < 0) return;
    const descontoAnualValor = descontoTipo === TipoDesconto.PERCENTUAL ? Math.round(bruto) : Math.round(bruto * 100);
    await api.patch(`/planos/${id}`, { descontoAnualTipo: descontoTipo, descontoAnualValor });
    setEditandoDescontoId(null);
    carregar();
  }

  function iniciarEdicaoSuporte(plano: Plano) {
    setEditandoSuporteId(plano.id);
    setSuportePrioritario(plano.atendimentoPrioritario);
    setSuporteWhatsapp(plano.whatsappSuporte ?? "");
    setErroSuporte(null);
  }

  // Validado tanto aqui (feedback imediato) quanto no backend (fonte da
  // verdade — ver CreatePlanoDto.whatsappSuporte): não dá pra ligar o
  // atendimento prioritário sem informar o WhatsApp.
  async function salvarSuporte(id: string) {
    setErroSuporte(null);
    const whatsappLimpo = suporteWhatsapp.replace(/\D/g, "");
    if (suportePrioritario && whatsappLimpo.length < 8) {
      setErroSuporte("Informe um WhatsApp válido com DDI e DDD (ex: 5531999999999).");
      return;
    }
    try {
      await api.patch(`/planos/${id}`, {
        atendimentoPrioritario: suportePrioritario,
        whatsappSuporte: suportePrioritario ? suporteWhatsapp.trim() : undefined,
      });
      setEditandoSuporteId(null);
      carregar();
    } catch (err: any) {
      setErroSuporte(err?.response?.data?.message ?? "Não foi possível salvar.");
    }
  }

  async function criarPlano(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const precoCentavos = Math.round(parseFloat(novoPlano.precoReais.replace(",", ".")) * 100);
    if (!novoPlano.nome.trim()) return setErro("Digite o nome do plano.");
    if (Number.isNaN(precoCentavos) || precoCentavos <= 0) return setErro("Digite um preço válido (ex: 79,00).");
    const descontoBruto = novoPlano.descontoAnualValor.trim() ? parseFloat(novoPlano.descontoAnualValor.replace(",", ".")) : 0;
    if (Number.isNaN(descontoBruto) || descontoBruto < 0) return setErro("Digite um desconto anual válido (ou deixe em branco).");
    if (novoPlano.atendimentoPrioritario && novoPlano.whatsappSuporte.replace(/\D/g, "").length < 8) {
      return setErro("Informe um WhatsApp válido com DDI e DDD (ex: 5531999999999) para o atendimento prioritário.");
    }

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
        descontoAnualTipo: novoPlano.descontoAnualTipo,
        descontoAnualValor: novoPlano.descontoAnualTipo === TipoDesconto.PERCENTUAL ? Math.round(descontoBruto) : Math.round(descontoBruto * 100),
        atendimentoPrioritario: novoPlano.atendimentoPrioritario,
        whatsappSuporte: novoPlano.atendimentoPrioritario ? novoPlano.whatsappSuporte.trim() : undefined,
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

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: "#837A73", flex: 1 }}>Desconto no plano anual (opcional)</span>
            <select
              value={novoPlano.descontoAnualTipo}
              onChange={(e) => setNovoPlano((p) => ({ ...p, descontoAnualTipo: e.target.value as TipoDesconto }))}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value={TipoDesconto.PERCENTUAL}>% de desconto</option>
              <option value={TipoDesconto.VALOR_FIXO}>R$ de desconto</option>
            </select>
            <input
              placeholder={novoPlano.descontoAnualTipo === TipoDesconto.PERCENTUAL ? "Ex: 15" : "Ex: 100,00"}
              value={novoPlano.descontoAnualValor}
              onChange={(e) => setNovoPlano((p) => ({ ...p, descontoAnualValor: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid #F1EEE9" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={novoPlano.atendimentoPrioritario}
                onChange={(e) => setNovoPlano((p) => ({ ...p, atendimentoPrioritario: e.target.checked }))}
              />
              Atendimento prioritário (libera WhatsApp de suporte pra esse plano)
            </label>
            {novoPlano.atendimentoPrioritario && (
              <input
                placeholder="WhatsApp com DDI e DDD (ex: 5531999999999)"
                value={novoPlano.whatsappSuporte}
                onChange={(e) => setNovoPlano((p) => ({ ...p, whatsappSuporte: e.target.value }))}
                style={inputStyle}
              />
            )}
          </div>

          {novoPlano.precoReais && !Number.isNaN(parseFloat(novoPlano.precoReais.replace(",", "."))) && (
            <div style={{ fontSize: 12, color: "#837A73" }}>
              Preço anual resultante:{" "}
              <strong style={{ color: "#3A3530" }}>
                {centavosParaReais(
                  calcularPrecoAnualCentavos(
                    Math.round(parseFloat(novoPlano.precoReais.replace(",", ".")) * 100),
                    novoPlano.descontoAnualTipo,
                    (() => {
                      const bruto = parseFloat((novoPlano.descontoAnualValor || "0").replace(",", "."));
                      const seguro = Number.isNaN(bruto) ? 0 : bruto;
                      return novoPlano.descontoAnualTipo === TipoDesconto.PERCENTUAL ? seguro : Math.round(seguro * 100);
                    })(),
                  ),
                )}
              </strong>
            </div>
          )}

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

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1EEE9" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#837A73", textTransform: "uppercase" }}>Plano anual</div>
              {editandoDescontoId === plano.id ? (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={descontoTipo}
                      onChange={(e) => setDescontoTipo(e.target.value as TipoDesconto)}
                      style={{ ...inputStyle, flex: 1, fontSize: 12.5 }}
                    >
                      <option value={TipoDesconto.PERCENTUAL}>% de desconto</option>
                      <option value={TipoDesconto.VALOR_FIXO}>R$ de desconto</option>
                    </select>
                    <input
                      value={descontoValor}
                      onChange={(e) => setDescontoValor(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                  <button onClick={() => salvarDesconto(plano.id)} style={btnPrimary}>
                    Salvar desconto
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>
                    {centavosParaReais(calcularPrecoAnualCentavos(plano.precoCentavos, plano.descontoAnualTipo, plano.descontoAnualValor))}
                    <span style={{ fontSize: 12, color: "#837A73", fontWeight: 600 }}>
                      {" "}
                      (
                      {plano.descontoAnualTipo === TipoDesconto.PERCENTUAL
                        ? `${plano.descontoAnualValor}% off`
                        : `${centavosParaReais(plano.descontoAnualValor)} off`}
                      )
                    </span>
                  </div>
                  <button onClick={() => iniciarEdicaoDesconto(plano)} style={{ ...btnSecondary, width: "100%", marginTop: 8 }}>
                    Editar desconto anual
                  </button>
                </>
              )}
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #F1EEE9" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#837A73", textTransform: "uppercase" }}>
                Suporte prioritário
              </div>
              {editandoSuporteId === plano.id ? (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {erroSuporte && <div style={{ color: "#C1442E", fontSize: 12 }}>{erroSuporte}</div>}
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={suportePrioritario}
                      onChange={(e) => setSuportePrioritario(e.target.checked)}
                    />
                    Tem WhatsApp de atendimento prioritário
                  </label>
                  {suportePrioritario && (
                    <input
                      placeholder="WhatsApp com DDI e DDD (ex: 5531999999999)"
                      value={suporteWhatsapp}
                      onChange={(e) => setSuporteWhatsapp(e.target.value)}
                      style={inputStyle}
                    />
                  )}
                  <button onClick={() => salvarSuporte(plano.id)} style={btnPrimary}>
                    Salvar suporte
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                    {plano.atendimentoPrioritario ? `WhatsApp: ${plano.whatsappSuporte}` : "Somente e-mail (padrão)"}
                  </div>
                  <button onClick={() => iniciarEdicaoSuporte(plano)} style={{ ...btnSecondary, width: "100%", marginTop: 8 }}>
                    Editar suporte prioritário
                  </button>
                </>
              )}
            </div>

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
