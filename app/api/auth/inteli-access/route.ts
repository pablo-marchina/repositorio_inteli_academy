import { z } from "zod";
import { env } from "@/lib/env";
import { isInteliInstitutionalEmail } from "@/lib/institutional-access";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ email: z.string().trim().email() });

function genericSuccess() {
  return Response.json({
    ok: true,
    message: "Se este e-mail Inteli ainda não tinha acesso, enviamos um link para concluir o cadastro. Se você já possui conta, entre com sua senha atual."
  });
}

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    const normalizedEmail = email.toLowerCase();

    if (!isInteliInstitutionalEmail(normalizedEmail)) {
      return Response.json(
        { error: "Use um e-mail institucional da Inteli (por exemplo, nome@sou.inteli.edu.br)." },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: { role: "admin", access_source: "inteli_domain" },
      redirectTo: `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/auth/accept`
    });

    if (!error) return genericSuccess();

    // Do not reveal whether a valid institutional address already has an account.
    const message = error.message.toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return genericSuccess();
    }

    console.error("Inteli institutional access invite failed", {
      emailDomain: normalizedEmail.split("@")[1] ?? "unknown",
      error: error.message
    });
    return Response.json({ error: "Não foi possível liberar o acesso agora. Tente novamente ou fale com um administrador." }, { status: 502 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Informe um e-mail institucional válido." }, { status: 400 });
    }
    console.error("Inteli institutional access request failed", error);
    return Response.json({ error: "Não foi possível processar a solicitação de acesso." }, { status: 500 });
  }
}
