"use client";

import { ChangeEvent, FormEvent, useState } from "react";

const DAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function ScheduleForm({ initial }: { initial: { timezone: string; publish_weekday: number; publish_hour: number; generation_lead_hours: number; auto_publish: boolean } }) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const response = await fetch("/api/settings/schedule", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });
    const payload = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Configuração salva." : payload.error ?? "Falha ao salvar.");
    setPending(false);
  }

  return (
    <form onSubmit={submit}>
      <div className="inline-form">
        <div className="field">
          <label htmlFor="weekday">Dia</label>
          <select id="weekday" value={values.publish_weekday} onChange={(event: ChangeEvent<HTMLSelectElement>) => setValues({ ...values, publish_weekday: Number(event.target.value) })}>
            {DAYS.map((day, index) => <option value={index} key={day}>{day}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hour">Hora</label>
          <select id="hour" value={values.publish_hour} onChange={(event: ChangeEvent<HTMLSelectElement>) => setValues({ ...values, publish_hour: Number(event.target.value) })}>
            {Array.from({ length: 24 }, (_, hour) => <option value={hour} key={hour}>{String(hour).padStart(2, "0")}:00</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="timezone">Fuso horário</label>
          <input id="timezone" value={values.timezone} onChange={(event: ChangeEvent<HTMLInputElement>) => setValues({ ...values, timezone: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="lead">Gerar com antecedência (horas)</label>
          <input id="lead" type="number" min={1} max={168} value={values.generation_lead_hours} onChange={(event: ChangeEvent<HTMLInputElement>) => setValues({ ...values, generation_lead_hours: Number(event.target.value) })} />
        </div>
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "18px 0" }}>
        <input type="checkbox" checked={values.auto_publish} onChange={(event: ChangeEvent<HTMLInputElement>) => setValues({ ...values, auto_publish: event.target.checked })} />
        Publicar automaticamente depois que todas as revisões forem aprovadas
      </label>
      <button className="button" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar agendamento"}</button>
      {message ? <p className={message.includes("salva") ? "feedback success" : "feedback error"}>{message}</p> : null}
    </form>
  );
}
