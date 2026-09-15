# FAZ 4: Portföy Değişikliği ve Sayaç (Phase 4)

## 🎯 Hedef
Her 3 haberde (turda) bir, oyunu durdurup herkese portföyünü yeniden yapılandırması için 2 dakikalık bir mola vermek.

## 🛠️ Yapılacaklar
1. **Tetikleyici (Trigger):**
   - Faz 3'teki `round_count` 3, 6, 9 gibi 3'ün katlarına ulaştığında oyun otomatik olarak "Rebalance (Yeniden Dağıtım)" moduna geçer.

2. **2 Dakikalık Sayaç (Timer):**
   - Ekranda 02:00'dan geriye sayan bir sayaç başlar. Bu sayaç sunucu/veritabanı zamanlı olmalıdır (biri sayfayı yenilese bile sayaç bozulmamalı).
   
3. **Yeniden Dağıtım Ekranı:**
   - Oyuncular, güncel "Toplam Varlıklarını" (örneğin para 1.250.000 TL olmuştur) sıfırdan 8 yatırım aracına tekrar dağıtırlar.
   - İsteyen "Değişiklik Yapma" diyerek mevcut haliyle bırakabilir.
   - Herkes "Hazırım" butonuna basarsa (veya 2 dakika dolarsa), ekran kapanır ve oyun haber çarkına geri döner.