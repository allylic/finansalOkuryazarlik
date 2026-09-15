# FAZ 5: Bitiş, Skor ve Analitik (Phase 5)

## 🎯 Hedef
Her oyuncu "1 kez haber çekme sırasını" tamamladığında (veya belirlenen toplam tur bittiğinde) oyunu sonlandırıp sonuçları göstermek.

## 🛠️ Yapılacaklar
1. **Bitiş Koşulu:**
   - Masadaki her oyuncu 1 (veya istenirse X) kez haber butonuna bastığında, oyun `finished` statüsüne geçer.

2. **Skor Tablosu (Leaderboard):**
   - En yüksek Toplam Bakiye'ye sahip oyuncu "Muz Cumhuriyeti Finans Bakanı" (Kazanan) ilan edilir.
   - **Çoklu Skor Detayları:** Sadece toplam para değil, oyuncuların kazanç istatistikleri gösterilir:
     - En çok kâr ettiren yatırım aracı (örn: "Altından %40 kazandı").
     - En çok zarar ettiren hamle.
   
3. **Yeni Oyun Butonu:**
   - Oyuncuları tekrar lobiye döndürüp, portföyleri ve oyun statüsünü sıfırlayacak (reset) fonksiyon yazılır.