# FAZ 2: Lobi ve İlk Yatırım Ekranı (Phase 2)

## 🎯 Hedef
Oyuncuların aynı odaya (game_id) bağlanabilmesi ve oyuna başlamadan önce 1.000.000 TL'lik bütçelerini 8 yatırım aracına dağıtabilmeleri.

## 🛠️ Yapılacaklar
1. **Lobi Ekranı (Waiting Room):**
   - Oyuncu ismini girip bir oyuna katılır.
   - Tüm oyuncular geldiğinde "Oyunu Başlat" butonu aktif olur.

2. **Başlangıç Portföy Ekranı:**
   - Ekranda toplam bütçe: **1.000.000 TL** yazar.
   - 8 adet yatırım aracı (Hisse, Fon, Eurobond, Altın, Gümüş, Faiz, VIOP, Tahvil) için input (slider veya sayı girişi) alanları oluşturulur.
   - **Kural:** Girilen değerlerin toplamı 1.000.000 TL'yi geçemez ve eksik kalamaz.
   - Dağıtım bitince "Onayla ve Oyuna Geç" butonuna basılır.

3. **Supabase Entegrasyonu:**
   - Seçilen portföy değerleri Supabase `players` tablosuna kaydedilir.
   - Herkes onayladığında oyun durumu `playing` olarak güncellenir (Supabase Realtime bunu algılayıp herkesi oyun ekranına atar).