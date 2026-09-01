"use client";

import React from "react";
import { usePathname } from "next/navigation";
import "./globals.css";
import { Sidebar } from "../components/Sidebar";
import { AuthGuard } from "../components/AuthGuard";

// Layout raiz: a página /login fica fora do AuthGuard/Sidebar; todo o resto
// do painel exige login de SAAS_ADMIN.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  return (
    <html lang="pt-BR">
      <head>
        <title>BarberOS — Painel SaaS</title>
      </head>
      <body>
        {isLogin ? (
          children
        ) : (
          <AuthGuard>
            <div style={{ display: "flex", minHeight: "100vh" }}>
              <Sidebar />
              <main style={{ flex: 1, padding: "36px 40px", overflowY: "auto" }}>{children}</main>
            </div>
          </AuthGuard>
        )}
      </body>
    </html>
  );
}
