# FAZ 1: Altyapı ve Veritabanı (Phase 1)

## 🎯 Hedef
React projesinin oluşturulması, GitHub repoya pushlanması, Vercel üzerinden canlıya alınması ve Supabase veritabanı şemalarının kurgulanması.

## 🛠️ Yapılacaklar
1. **Proje Başlangıcı:**
   - `npx create-react-app muz-cumhuriyeti-101` (veya Vite) ile proje oluştur.
   - GitHub reposu aç ve projeyi bağla.
   - Vercel'e projeyi import et ve otomatik deploy (CI/CD) sürecini başlat.
   
2. **Supabase Kurulumu & Tablolar:**
   Supabase üzerinde aşağıdaki tablolar oluşturulacak:
   
   - **`news` (Haberler Tablosu - 10 Kolon):**
     - `id` (Primary Key)
     - `haber_metni` (String)
     - `hisse_etki` (Float - örn: 1.1)
     - `fon_etki` (Float)
     - `eurobond_etki` (Float)
     - `altin_etki` (Float)
     - `gumus_etki` (Float)
     - `faiz_etki` (Float)
     - `viop_etki` (Float)
     - `tahvil_etki` (Float)
   
   - **`games` (Oyun Odaları Tablosu):**
     - `id` (UUID), `status` (waiting, playing, finished), `current_turn_index` (Int), `round_count` (Int)
     
   - **`players` (Oyuncular Tablosu):**
     - `id`, `game_id` (Foreign Key), `name` (String), `total_value` (Başlangıç 1.000.000)
     - Portföy Kolonları: `hisse`, `fon`, `eurobond`, `altin`, `gumus`, `faiz`, `viop`, `tahvil` (Hepsi Float)

3. **Veri Girişi:**
   - 50 adet haber için bir CSV dosyası hazırlanıp Supabase `news` tablosuna import edilecek.