# MICRO-SWARM sonuçları

Tarih: 2026-11-03T23:48:45.468Z

Mock/replay satırları model başarısı değildir. Değerlendirilmeyen koşumlar başarısızlık oranına çevrilmez.

| Provider | Kol | Geçen / toplam | Değerlendirilen | Çağrı | Token (gerçek) | Süre ms | p95 ms | Neuron üst sınır | Provider hatası | Hata türleri |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| mock | A | 1 / 1 | 1 | 1 | bilinmiyor | 1289 | 1289 | 158.13 | 0 | — |
| mock | A2 | 1 / 1 | 1 | 1 | bilinmiyor | 1278 | 1278 | 45.99 | 0 | — |
| mock | B | 1 / 1 | 1 | 4 | bilinmiyor | 2552 | 2552 | 216.86 | 0 | — |
| mock | C | 1 / 1 | 1 | 3 | bilinmiyor | 1349 | 1349 | 151.95 | 0 | — |

## Karar

**TEZ KANITLANMADI.** Tam, gerçek ve kabul testleri çalıştırılmış 20 × A/B/C veri kümesi yok. Araştırma kararı verilemez.

C ile B karşılaştırması ve eşit bütçeli A2 kontrolü olmadan dinamik koordinasyon katkısı iddia edilmez. 20 görevde eşiklerin aşılması kesin kanıt değildir.

## Koşumlar

- 1793749718995-dev-inventory-A-04f1bc05: PASS (mock)
- 1793749720286-dev-inventory-A2-c7bb1c44: PASS (mock)
- 1793749721565-dev-inventory-B-9be40a13: PASS (mock)
- 1793749724118-dev-inventory-C-9fa247a7: PASS (mock)
