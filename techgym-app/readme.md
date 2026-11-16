# Techgym — Sistema de Treinos e Frequência (PWA)

Aplicação web progressiva (PWA) ultraleve desenvolvida para a **Techgym Academia**, permitindo que alunos acessem suas fichas de treino, visualizem o número dos aparelhos, assistam a vídeos demonstrativos e registrem presença pelo celular, enquanto instrutores gerenciam cadastros e treinos pelo computador.

## Arquitetura e Stack

- **Frontend:** HTML5, CSS3 e Vanilla JavaScript (ES6 Modules) — zero dependências de build ou pacotes externos.
- **PWA:** `manifest.json` e `sw.js` (Service Worker) para instalação na tela inicial (Android/iOS) e cache offline de fichas via `localStorage`.
- **Backend & Banco de Dados:** Supabase (PostgreSQL + Auth + PostgREST).
- **Vídeos:** Incorporação sob demanda (`lazy loading`) via YouTube (`youtube-nocookie.com`).
- **Hospedagem:** Estática (GitHub Pages / Cloudflare Pages).

## Estrutura de Diretórios

```text
techgym-app/
├── index.html          # Autenticação e redirecionamento por perfil
├── aluno.html          # Interface mobile-first do aluno
├── admin.html          # Painel desktop de gestão (alunos, aparelhos e fichas)
├── manifest.json       # Metadados do PWA
├── sw.js               # Service Worker para cache estático
├── css/
│   ├── global.css      # Tokens visuais e componentes base
│   ├── aluno.css       # Estilos da visão do aluno e botão WhatsApp
│   └── admin.css       # Estilos de tabelas e formulários administrativos
├── js/
│   ├── config.js       # Inicialização do cliente Supabase e contatos
│   ├── auth.js         # Controle de sessão e verificação de role (student/admin)
│   ├── student.js      # Renderização de treinos, check-in diário e player de vídeo
│   └── admin.js        # CRUD de exercícios, alunos e montagem de fichas
└── assets/             # Ícones do aplicativo (192x192 e 512x512)