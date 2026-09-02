"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

interface BarbeariaResumo {
  id: string;
  nome: string;
  criadoEm: string;
  assinatura: { status: string; plano: { nome: string } } | null;
  funcionarios: unknown[];
}

export default function BarbeariasPage() {
  const [barbearias, setBarbearias] = useState<BarbeariaResumo[]>([]);

  useEffect(() => {
    api.get<BarbeariaResumo[]>("/barbearias").then((res) => setBarbearias(res.data));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Barbearias</h1>
      <p style={{ color: "#837A73", fontSize: 13 }}>Todas as contas assinantes da plataforma</p>

      <div style={{ border: "1px solid #DEDAD4", borderRadius: 14, background: "white", marginTop: 20, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>Barbearia</th>
              <th>Plano</th>
              <th>Funcionários</th>
              <th>Status</th>
              <th>Desde</th>
            </tr>
          </thead>
          <tbody>
            {barbearias.map((b) => (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => (window.location.href = `/barbearias/${b.id}`)}>
                <td style={{ fontWeight: 700 }}>
                  <Link href={`/barbearias/${b.id}`} onClick={(e) => e.stopPropagation()}>
                    {b.nome}
                  </Link>
                </td>
                <td>{b.assinatura?.plano.nome ?? "—"}</td>
                <td>{b.funcionarios.length}</td>
                <td>{b.assinatura?.status ?? "—"}</td>
                <td>{new Date(b.criadoEm).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
