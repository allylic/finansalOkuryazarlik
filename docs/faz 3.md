# FAZ 3: Haber Çarkı ve Portföy Güncelleme (Phase 3)

## 🎯 Hedef
Sırası gelen oyuncunun haber çekmesi ve çıkan habere göre TÜM oyuncuların portföy değerlerinin otomatik hesaplanması.

## 🛠️ Yapılacaklar
1. **Sıra Sistemi (Turn Management):**
   - Ekranın üstünde "Sıra: Oyuncu 1" şeklinde bilgi yer alır. Sadece sırası gelen oyuncu "Haber Çek" butonuna basabilir.
   
2. **Haber Seçimi:**
   - Butona basıldığında Supabase'deki `news` tablosundan rastgele bir haber (`id`) seçilir (daha önce çıkmamış bir haber olmalı).
   - Çıkan haber, animasyonlu bir şekilde (örneğin Breaking News grafiğiyle) herkesin ekranında belirir.

3. **Matematiksel Hesaplama (Portföy Etkisi):**
   - Haberin etki oranları (örn: Altın: 1.15, Hisse: 0.90) tüm oyuncuların mevcut portföy değerleriyle çarpılır.
   - *Örnek:* Oyuncunun 100.000 TL'lik altını varsa ve etki 1.15 ise, yeni değer 115.000 TL olur.
   - Güncellenen yeni portföy değerleri ve yeni `total_value` veritabanına yazılır.

4. **Tur Sayacı:**
   - Her haber çekildiğinde `games` tablosundaki `round_count` 1 artırılır.