"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ContentWorkbench.module.css";

export function StudioMotionControl({ projectId, versionId, versionNumber }: { projectId: string; versionId: string; versionNumber: number }) {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply() {
    if (!request.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/studio/${projectId}/versions/${versionId}/motion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changeRequest: request })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao atualizar o timing.");
      setRequest("");
      router.refresh();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} style={{ marginBottom: 20 }}>
      <span className="eyebrow">Editor de vídeo por IA</span>
      <h3>Refinar a montagem da V{versionNumber}</h3>
      <p>Dê instruções em linguagem natural para refinar o timing das camadas sem criar um editor manual na plataforma. A timeline estruturada continua sendo a fonte de verdade e segue exportável para DaVinci/OTIO.</p>
      <textarea className={styles.textarea} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Ex.: faça o título entrar 0,5s depois e a música começar junto do primeiro corte." />
      <div className={styles.actions}><button className={styles.primary} type="button" onClick={apply} disabled={busy || !request.trim()}>{busy ? "Atualizando…" : "Aplicar ajuste com IA"}</button></div>
      {error ? <div className={styles.error}>{error}</div> : null}
    </section>
  );
}
