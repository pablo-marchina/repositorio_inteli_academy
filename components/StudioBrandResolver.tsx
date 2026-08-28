"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ContentWorkbench.module.css";
import type { DriveAsset } from "@/lib/types";

export function StudioBrandResolver({
  projectId,
  initialPartnerName,
  initialPartnerLogoAssetId
}: {
  projectId: string;
  initialPartnerName?: string;
  initialPartnerLogoAssetId?: string;
}) {
  const router = useRouter();
  const [partnerName, setPartnerName] = useState(initialPartnerName ?? "");
  const [partnerLogoAssetId, setPartnerLogoAssetId] = useState(initialPartnerLogoAssetId ?? "");
  const [assets, setAssets] = useState<DriveAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadImages() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/drive/files", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao carregar imagens do Drive.");
      setAssets((body.assets ?? []).filter((asset: DriveAsset) => asset.mimeType.startsWith("image/")));
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (partnerLogoAssetId && !partnerName.trim()) {
      setMessage("Informe o nome do parceiro associado à logo.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/studio/${projectId}/brand`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partnerName: partnerName.trim(), partnerLogoAssetId })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Falha ao atualizar a marca parceira.");
      setMessage(`Nova versão V${body.result.versionNumber} criada. Reimporte-a no Figma para validar a marca.`);
      router.refresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  }

  const selected = assets.find((asset) => asset.id === partnerLogoAssetId);

  return <section className={styles.card} style={{ marginBottom: 20 }}>
    <span className="eyebrow">Brand assets</span>
    <h2 style={{ marginTop: 6 }}>Marca parceira</h2>
    <p>Defina a empresa representada e selecione uma imagem oficial/autorizada do Drive. A logo fica fora do pool de footage e é aplicada pelo Figma como <code>partnerLogo</code>.</p>
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(220px, 1fr) minmax(260px, 1fr)", alignItems: "end" }}>
      <label style={{ display: "grid", gap: 6 }}><span>Parceiro</span><input value={partnerName} onChange={(event) => { setPartnerName(event.target.value); if (!event.target.value.trim()) setPartnerLogoAssetId(""); }} placeholder="Nome da organização" /></label>
      <label style={{ display: "grid", gap: 6 }}><span>Logo oficial/autorizada</span><select value={partnerLogoAssetId} onFocus={() => { if (!assets.length) void loadImages(); }} onChange={(event) => setPartnerLogoAssetId(event.target.value)}><option value="">Sem logo selecionada</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
    </div>
    <div className={styles.actions} style={{ marginTop: 12 }}>
      <button className={styles.secondary} type="button" disabled={loading} onClick={() => void loadImages()}>{loading ? "Carregando…" : "Carregar imagens do Drive"}</button>
      <button className={styles.primary} type="button" disabled={saving} onClick={() => void save()}>{saving ? "Criando nova versão…" : "Salvar marca em nova versão"}</button>
    </div>
    {selected ? <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}><img src={`/api/drive/preview/${encodeURIComponent(selected.id)}`} alt="Logo parceira selecionada" style={{ width: 84, height: 52, objectFit: "contain", background: "white", borderRadius: 8 }} /><span style={{ fontSize: 13, opacity: .76 }}>{selected.name} · asset de marca, não footage</span></div> : null}
    {partnerName.trim() && !partnerLogoAssetId ? <p style={{ marginTop: 10, fontSize: 13 }}>Sem logo resolvida, a geração/revisão pode continuar, mas a aprovação final será bloqueada.</p> : null}
    {message ? <p style={{ marginTop: 10, fontSize: 13 }}>{message}</p> : null}
  </section>;
}
