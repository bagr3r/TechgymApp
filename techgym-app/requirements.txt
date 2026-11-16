# ==============================================================================
# TECHGYM PWA - REQUISITOS TÉCNICOS E DEPENDÊNCIAS EXTERNAS
# Arquitetura 100% Client-Side (Zero dependências locais / Sem runtime Python/Node)
# ==============================================================================

# 1. Dependências Externas (Carregadas via ES Modules CDN no navegador)
@supabase/supabase-js==2.x  # URL: https://esm.sh/@supabase/supabase-js@2

# 2. Serviços de Infraestrutura (Nuvem)
supabase-postgresql>=15.0   # Banco de dados, Auth e Row Level Security (RLS)
youtube-nocookie-embed      # Player de vídeos demonstrativos sob demanda
github-pages / cloudflare   # Hospedagem estática com HTTPS obrigatório (PWA)

# 3. Requisitos do Cliente (Navegadores Suportados)
# - Suporte a ES6 Modules (<script type="module">)
# - Suporte a Service Workers e Web App Manifest (PWA)
# - Suporte a Web Storage API (localStorage para cache offline de treinos)