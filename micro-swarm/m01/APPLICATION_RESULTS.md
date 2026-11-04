# MICRO-SWARM sonuçları

Tarih: 2026-11-03T23:52:24.873Z

Mock/replay satırları model başarısı değildir. Değerlendirilmeyen koşumlar başarısızlık oranına çevrilmez.

| Provider | Kol | Geçen / toplam | Değerlendirilen | Çağrı | Token (gerçek) | Süre ms | p95 ms | Neuron üst sınır | Provider hatası | Hata türleri |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| cloudflare | A | 0 / 1 | 1 | 1 | 1594 | 6780 | 6780 | 158.13 | 0 | runtime_error |
| cloudflare | A2 | 0 / 1 | 1 | 4 | 10807 | 27295 | 27295 | 226.07 | 0 | runtime_error |
| cloudflare | B | 0 / 1 | 1 | 4 | 7408 | 14494 | 14494 | 187.48 | 0 | syntax_error, runtime_error |
| cloudflare | C | 0 / 1 | 0 | 3 | 2643 | 5640 | 5640 | 82.44 | 0 | syntax_error |

## Karar

**TEZ KANITLANMADI.** Tam, gerçek ve kabul testleri çalıştırılmış 20 × A/B/C veri kümesi yok. Araştırma kararı verilemez.

C ile B karşılaştırması ve eşit bütçeli A2 kontrolü olmadan dinamik koordinasyon katkısı iddia edilmez. 20 görevde eşiklerin aşılması kesin kanıt değildir.

## Koşumlar

- 1793749890659-dev-inventory-A-99cb0bcc: FAIL (cloudflare)
- 1793749897440-dev-inventory-A2-936b7023: FAIL (cloudflare)
- 1793749924735-dev-inventory-B-1fd4841d: FAIL (cloudflare)
- 1793749939230-dev-inventory-C-465862fe: NOT EVALUATED (cloudflare)
