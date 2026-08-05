# Guia de Instalação — BudgetOS

Este guia ensina o passo a passo para você ou qualquer outra pessoa instalar, configurar e colocar no ar o **BudgetOS** a partir deste repositório.

---

## 📋 Requisitos Prévios

Antes de começar, certifique-se de ter instalado ou ter contas criadas nas seguintes ferramentas:
1. **Node.js** (versão 18 ou superior) instalado no computador.
2. Conta gratuita no **[Supabase](https://supabase.com)** (para o banco de dados).
3. Conta gratuita na **[Vercel](https://vercel.com)** (para colocar o site no ar de graça).

---

## 🛠️ Passo 1: Configurando o Banco de Dados (Supabase)

O BudgetOS utiliza o Supabase para guardar as suas transações, categorias e configurações com segurança.

1. Acesse o painel do **[Supabase](https://supabase.com)** e crie um novo projeto gratuito.
2. No menu lateral esquerdo do projeto criado, clique em **SQL Editor**.
3. Clique em **New query** (Nova consulta) para criar uma folha em branco.
4. Abra o arquivo de migração do banco localizado neste repositório em `supabase/migrations/20260701000001_core_schema.sql`. Copie todo o código contido nele, cole-o no SQL Editor do Supabase e clique em **Run** (Executar).
   * *Isso criará automaticamente todas as tabelas necessárias (`months`, `transactions`, `categories`, etc.) no seu banco de dados.*
5. Vá nas **Project Settings** (Configurações do Projeto) > **API** no Supabase e copie os seguintes valores:
   * **Project URL**
   * **API key (anon public)**

---

## 💻 Passo 2: Instalando e Rodando Localmente

1. Faça o download ou clone este repositório do GitHub em sua máquina:
   ```bash
   git clone https://github.com/euviniciusdepaula/BudgetOS.git
   ```
2. Acesse a pasta do projeto e instale as dependências:
   ```bash
   npm install
   ```
3. Crie um arquivo chamado `.env.local` na raiz do projeto (você pode duplicar e renomear o `.env.example`) e cole as chaves que você copiou do Supabase no passo anterior:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=cole_aqui_a_sua_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=cole_aqui_a_sua_api_key_anon
   ```
   * *Se quiser usar o copiloto de IA e o simulador, acrescente também as variáveis descritas no [Passo 4](#-passo-4-configurando-a-ia-opcional).*
4. Inicie o servidor de desenvolvimento local:
   ```bash
   npm run dev
   ```
5. Abra o navegador e acesse **`http://localhost:3000`** para usar o aplicativo!

---

## 🚀 Passo 3: Colocando o Aplicativo no Ar (Deploy na Vercel)

Para colocar o aplicativo na internet para que você (ou qualquer amigo) possa acessá-lo do celular ou de qualquer lugar do mundo de forma segura e gratuita:

1. Acesse a **[Vercel](https://vercel.com)** e faça login com sua conta do GitHub.
2. Clique em **Add New...** > **Project** e importe o repositório `BudgetOS` da sua conta do GitHub.
3. Na seção **Environment Variables** (Variáveis de Ambiente) durante a configuração do projeto na Vercel, adicione as mesmas duas chaves do Supabase:
   * Nome: `NEXT_PUBLIC_SUPABASE_URL` | Valor: *Sua Project URL*
   * Nome: `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Valor: *Sua API Key anon*
4. Clique em **Deploy**!
   * *O Vercel vai compilar o código e gerar um link público do seu app em instantes.*

---

## 🤖 Passo 4: Configurando a IA (opcional)

O copiloto (entrada em linguagem natural, tipo *"gastei 45 no almoço"*) e o simulador de compras usam uma API de IA. **O resto do aplicativo funciona normalmente sem isso** — você só perde o atalho de digitar em vez de preencher formulário.

O cliente aceita qualquer provedor compatível com a API de chat completions da OpenAI. Configure três variáveis:

| Variável | Descrição | Padrão |
| --- | --- | --- |
| `AI_API_KEY` | Chave do provedor | *(obrigatória)* |
| `AI_BASE_URL` | URL base da API | `https://api.openai.com/v1` |
| `AI_MODEL` | Nome do modelo | `gpt-4o-mini` |

Exemplos de configuração:

```env
# Groq — possui plano gratuito
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=openai/gpt-oss-120b

# OpenAI
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

Coloque as mesmas variáveis na Vercel em **Settings → Environment Variables**. Variável nova só passa a valer em um deploy novo.

### Escolha do modelo

O copiloto pede a resposta em *Structured Outputs* — JSON obedecendo a um schema — porque o resultado é gravado direto no banco. **Nem todo modelo suporta isso**, e a escolha importa:

| Modelo (Groq) | `json_schema` | Observação |
| --- | --- | --- |
| `openai/gpt-oss-120b` | ✅ estrito | Recomendado. O provedor garante o formato |
| `openai/gpt-oss-20b` | ✅ estrito | Mais rápido, modelo menor |
| `llama-3.3-70b-versatile` | ❌ | Cai no fallback descrito abaixo |
| `llama-3.1-8b-instant` | ❌ | Cai no fallback. O mais econômico |

Se o provedor recusar o `json_schema`, o cliente repete a chamada no modo JSON genérico, com o schema embutido no prompt. Funciona, mas sem garantia do provedor — em modelos menores isso aumenta a chance de extração imprecisa. Para o simulador, que devolve texto livre, qualquer modelo serve.

---

## 🔒 Primeiro Acesso e Segurança

Ao abrir o aplicativo pela primeira vez:
1. Você verá uma tela de **Onboarding** que guiará você na criação de um **Cofre (Vault)** pessoal e na definição de uma senha/chave de acesso.
2. Guarde essa chave de acesso. O sistema gera uma criptografia no seu navegador e envia apenas um hash seguro para o banco de dados.
3. Em acessos futuros, bastará digitar a sua chave para desbloquear a visualização dos seus dados financeiros!
