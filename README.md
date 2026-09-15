# Muz Cumhuriyeti Finans Oyunu

Çok oyunculu, tur bazlı bir finansal okuryazarlık oyunu. Oyuncular 1.000.000 TL başlangıç bütçesini sekiz yatırım aracına dağıtır; haberlerin piyasa etkilerine göre portföy değerleri güncellenir.

## Mevcut Durum

| Alan | Durum | Not |
| --- | --- | --- |
| React + Vite altyapısı | Hazır | Uygulama şu anda Vite başlangıç ekranını gösteriyor. |
| GitHub bağlantısı | Hazır | `main` dalı GitHub uzak deposuna gönderildi. |
| Vercel deployment | Hazır | Vercel, `main` dalındaki değişiklikleri otomatik yayınlayacak şekilde bağlı. |
| Supabase istemcisi | Hazır | Ortam değişkenleriyle etkinleşen istemci `src/lib/supabase.js` içinde bulunuyor. |
| Veritabanı şeması | Hazır | `news`, `games` ve `players` tabloları için SQL şeması mevcut. |
| Haber verisi | Hazır | 50 örnek haberi içeren CSV mevcut. |
| Oyun arayüzü ve mantığı | Bekliyor | Faz 2-5 kapsamı henüz uygulanmadı. |

## Oyun Akışı

1. Oyuncu bir lobiye katılır veya oyun odası oluşturur.
2. Her oyuncu 1.000.000 TL bütçesini yatırım araçlarına eksiksiz dağıtır.
3. Sırası gelen oyuncu, daha önce kullanılmamış rastgele bir haber çeker.
4. Haberin çarpanları tüm oyuncuların portföylerine uygulanır.
5. Her üç haberden sonra iki dakikalık yeniden dağıtım turu açılır.
6. Belirlenen tur sayısı tamamlandığında skor tablosu kazananı ilan eder.

## Yatırım Araçları

- Hisse
- Fon
- Eurobond
- Altın
- Gümüş
- Faiz
- VİOP
- Tahvil

## Faz Durumu

### Faz 1 — Altyapı ve Veritabanı

Büyük ölçüde hazır:

- React + Vite proje altyapısı oluşturuldu.
- GitHub uzak deposu ve Vercel bağlantısı kuruldu.
- Supabase için `news`, `games` ve `players` tablolarını içeren şema hazırlandı.
- `news` tablosu için 50 satırlık örnek CSV eklendi.
- Realtime için `games` ve `players` tabloları yayına eklendi.

Eksik doğrulamalar:

- `supabase/schema.sql` dosyasının Supabase SQL Editor üzerinden çalıştırılması.
- `supabase/news.csv` verisinin `news` tablosuna içe aktarılması.
- Vercel ortam değişkenlerinin gerçek Supabase değerleriyle tanımlanması.

### Faz 2 — Lobi ve İlk Yatırım

Henüz uygulanmadı:

- Oyun odası oluşturma veya katılma.
- Oyuncu adı girişi ve bekleme odası.
- Sekiz araç için başlangıç portföyü dağıtım formu.
- Dağıtım toplamının tam olarak 1.000.000 TL olmasının doğrulanması.
- Oyuncu portföyünün Supabase'e kaydedilmesi ve Realtime ile oyun başlangıcı.

### Faz 3 — Haber Çarkı ve Portföy Güncelleme

Hazır:

- Oyuncu sırasını `current_turn_index` ile yöneten tur sistemi.
- Önceden çıkmamış haberlerin rastgele seçimi ve haber geçmişinin saklanması.
- Çekilen haberin tüm yatırım araçlarına ait etkilerinin tüm oyuncu portföylerine atomik uygulanması.
- Güncel portföy ve toplam varlık değerinin kaydedilmesi.
- Tur sayacının artırılması ve sıranın sonraki oyuncuya geçirilmesi.
- Realtime ile tüm oyuncuların haber ve portföy güncellemelerini anlık görmesi.

Veritabanı notu:

- `supabase/phase3.sql` Supabase SQL Editor üzerinden çalıştırılmalıdır; bu dosya `game_news` tablosunu ve `draw_news_for_game` fonksiyonunu içerir.

### Faz 4 — Yeniden Dağıtım ve Sayaç

Henüz uygulanmadı:

- Her üç turda bir yeniden dağıtım durumuna geçiş.
- Sunucu zamanına bağlı iki dakikalık sayaç.
- Güncel toplam varlığın yeniden dağıtılması.
- Oyuncular hazır olduğunda veya süre dolduğunda oyuna geri dönüş.

### Faz 5 — Sonuçlar ve Analitik

Henüz uygulanmadı:

- Bitiş koşulu ve `finished` oyun durumu.
- Sıralama tablosu ve kazananın ilanı.
- En yüksek getiri ve en yüksek zarar istatistikleri.
- Yeni oyun için lobiye dönüş ve sıfırlama işlemi.

## Kurulum

```bash
npm install
npm run dev
```

## Ortam Değişkenleri

`.env` dosyasını `.env.example` temelinde oluşturun:

```env
VITE_SUPABASE_URL=https://<proje-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<Supabase anon public key>
```

Bu değerler Vercel'de **Project Settings → Environment Variables** alanına da eklenmelidir.

## Veritabanı Kurulumu

1. Supabase projesinde SQL Editor'ü açın.
2. `supabase/schema.sql` içeriğini çalıştırın.
3. Table Editor üzerinden `supabase/news.csv` dosyasını `news` tablosuna içe aktarın.
4. Realtime ayarlarında `games` ve `players` tablolarının etkin olduğunu doğrulayın.

## Yayınlama

Vercel proje ayarları:

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Root Directory: depo kökü

`main` dalına yapılan her push, Vercel üzerinde otomatik deployment başlatır.

## Sonraki Geliştirme Adımı

Faz 2 ile başlanmalı: lobi, oda yönetimi, başlangıç portföy formu ve Supabase Realtime entegrasyonu uygulanmalıdır.
