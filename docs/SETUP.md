# Configuração e implantação

## 1. Supabase

1. Crie um projeto gratuito.
2. Abra o SQL Editor, abra o arquivo `supabase/migrations/202608050001_initial.sql`, copie todo o conteúdo SQL e execute-o. Não cole apenas o caminho do arquivo.
3. Em **Authentication → Providers → Email**, desative o cadastro público.
4. Em **Authentication → URL Configuration**, defina a URL pública do app e adicione estes redirects permitidos:

```text
https://SEU-DOMINIO/auth/callback
https://SEU-DOMINIO/auth/accept
```

5. Crie o primeiro administrador no Dashboard com **Add user → Send invitation**.
6. Abra o link recebido por e-mail, aguarde a validação e defina a senha na tela `/auth/accept`.
7. Copie a URL, a chave pública e a chave secreta do projeto para as variáveis de ambiente.

A chave secreta substitui a antiga `service_role` nos projetos novos. Nunca use essa chave em variáveis `NEXT_PUBLIC_*`.

Convites enviados por versões anteriores da aplicação apontavam para `/auth/callback` e podem voltar à tela de login sem permitir criar uma senha. Depois de atualizar a aplicação, remova o usuário ainda não ativado no Supabase e envie um novo convite.

### Opção de template SSR

O fluxo padrão funciona pela página cliente `/auth/accept`. Caso você personalize o template de convite para usar token hash no servidor, use um link como:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/auth/accept">
  Aceitar convite
</a>
```

## 2. Meta / Instagram

1. Crie um aplicativo em Meta for Developers.
2. Adicione o produto **Instagram** e configure **API with Instagram Login**.
3. Cadastre exatamente esta redirect URI:

```text
https://SEU-DOMINIO/api/instagram/callback
```

4. Solicite/configure os escopos:

```text
instagram_business_basic
instagram_business_content_publish
```

5. Preencha `META_APP_ID`, `META_APP_SECRET` e `META_GRAPH_VERSION`.
6. No painel da aplicação, abra **Configurações → Conectar Instagram**.

A conta precisa ser profissional, Business ou Creator. O fluxo com Instagram Login não exige uma Página do Facebook vinculada.

## 3. Gemini

Crie uma chave gratuita no Google AI Studio e informe:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

O sistema usa saída estruturada em JSON e valida cada resposta novamente com Zod. O modelo permanece configurável porque a disponibilidade e os limites da camada gratuita podem mudar.

## 4. Segredos

Gere as chaves locais:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use a primeira como `APP_ENCRYPTION_KEY` e a segunda como `CRON_SECRET`.

## 5. Desenvolvimento local

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Abra `http://localhost:3000`.

## 6. Deploy

1. Importe o repositório na Vercel.
2. Cadastre todas as variáveis de `.env.example`.
3. Faça o deploy.
4. Altere `NEXT_PUBLIC_APP_URL` para o domínio final e redeploy.
5. Cadastre no GitHub Actions:
   - `APP_URL`: domínio público do app;
   - `CRON_SECRET`: o mesmo valor usado no deploy.
6. Execute manualmente o workflow **AI Weekly automation** para validar.

## 7. Primeiro teste

1. Aceite um convite novo e defina a senha.
2. Conecte o Instagram em **Configurações**.
3. Use **Coletar agora**.
4. Abra **Publicações → Gerar semana**.
5. Confirme que o status ficou `approved` e abra a capa renderizada.
6. Para evitar uma publicação acidental, mantenha `auto_publish` desativado até concluir o teste.
7. Ative a publicação automática e configure o dia e a hora desejados.

## Limitações do MVP

- A similaridade inicial de títulos é lexical; a revisão por IA reduz agrupamentos inadequados. Embeddings podem ser adicionados quando o volume justificar.
- A renderização usa fontes seguras do sistema. A fonte proprietária Canela não é distribuída pelo repositório; o estilo editorial é preservado com fallback serifado.
- A Meta pode exigir App Review antes de conectar contas que não sejam administradoras/testadoras do aplicativo.
- A camada gratuita do Gemini possui limites e pode usar os dados enviados para melhorar os produtos do Google; não envie conteúdo confidencial para esse fluxo.
