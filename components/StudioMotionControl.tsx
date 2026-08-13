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
      <span className="eyebrow">Motion editor</span>
      <h3>Refinar timing da V{versionNumber}</h3>
      <p>Altere a timeline Remotion por linguagem natural sem achatar o projeto em vídeo. Os tempos atualizam as tracks estruturadas e seguem disponíveis no OTIO/manifest.</p>
      <textarea className={styles.textarea} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Ex.: título 0,5s depois; corpo aos 2s; duração total 15s." />
      <div className={styles.actions}><button className={styles.primary} type="button" onClick={apply} disabled={busy || !request.trim()}>{busy ? "Atualizando…" : "Aplicar timing"}</button></div>
      {error ? <div className={styles.error}>{error}</div> : null}
    </section>
  );
}
