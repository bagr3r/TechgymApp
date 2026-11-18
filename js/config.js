// js/config.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://uyvfupifizdsrkcyevis.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_qNinVzPpnmasSwDAcj20xA_QsPQ6IMq';

// Número do WhatsApp da academia (55 + DDD 31 + número)
export const GYM_WHATSAPP = '5531999999999';
export const DEFAULT_WHATSAPP_MSG = 'Olá! Estou usando o app da Techgym e preciso de ajuda.';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);