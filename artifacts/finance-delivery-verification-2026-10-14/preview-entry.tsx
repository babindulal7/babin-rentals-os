import '../../src/main'
import { supabase } from '../../src/lib/supabase'
Object.assign(window, { verificationBackend: supabase })
