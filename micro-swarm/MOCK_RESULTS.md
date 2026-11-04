# MICRO-SWARM sonuçları

Tarih: 2026-11-03T23:41:22.049Z

Mock/replay satırları model başarısı değildir. Değerlendirilmeyen koşumlar başarısızlık oranına çevrilmez.

| Provider | Kol | Geçen / toplam | Değerlendirilen | Çağrı | Token (gerçek) | Süre ms | p95 ms | Neuron üst sınır | Provider hatası | Hata türleri |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| mock | A | 13 / 13 | 13 | 13 | bilinmiyor | 15740 | 1331 | 1743.53 | 0 | — |
| mock | A2 | 2 / 2 | 2 | 2 | bilinmiyor | 2320 | 1167 | 0.00 | 0 | — |
| mock | B | 13 / 13 | 13 | 52 | bilinmiyor | 31700 | 2699 | 2397.35 | 0 | — |
| mock | C | 13 / 13 | 13 | 39 | bilinmiyor | 15797 | 1421 | 1675.89 | 0 | — |

## Karar

**TEZ KANITLANMADI.** Tam, gerçek ve kabul testleri çalıştırılmış 20 × A/B/C veri kümesi yok. Araştırma kararı verilemez.

C ile B karşılaştırması ve eşit bütçeli A2 kontrolü olmadan dinamik koordinasyon katkısı iddia edilmez. 20 görevde eşiklerin aşılması kesin kanıt değildir.

## Koşumlar

- 1793748870427-dev-inventory-A-ae4bb7b7: PASS (mock)
- 1793748871643-dev-inventory-A2-7d30bab1: PASS (mock)
- 1793748872797-dev-inventory-B-96ab8e61: PASS (mock)
- 1793748875135-dev-inventory-C-1fb611e5: PASS (mock)
- 1793749032800-dev-inventory-A-03f552e5: PASS (mock)
- 1793749033970-dev-inventory-A2-5cfa4343: PASS (mock)
- 1793749035138-dev-inventory-B-be829adf: PASS (mock)
- 1793749037484-dev-inventory-C-1920b075: PASS (mock)
- 1793749228097-holdout-01-A-456d13e3: PASS (mock)
- 1793749229300-holdout-01-B-2406bf03: PASS (mock)
- 1793749231673-holdout-01-C-90a98850: PASS (mock)
- 1793749232842-holdout-02-B-a1ef5347: PASS (mock)
- 1793749235181-holdout-02-C-7c6e28ae: PASS (mock)
- 1793749236344-holdout-02-A-b58a200e: PASS (mock)
- 1793749237513-holdout-03-C-75594df2: PASS (mock)
- 1793749238693-holdout-03-A-1e2d10be: PASS (mock)
- 1793749239869-holdout-03-B-25d2c431: PASS (mock)
- 1793749242562-holdout-04-A-6f0b5c91: PASS (mock)
- 1793749243822-holdout-04-B-2b039357: PASS (mock)
- 1793749246195-holdout-04-C-33575400: PASS (mock)
- 1793749247377-holdout-05-B-eda1d8ce: PASS (mock)
- 1793749249796-holdout-05-C-f7133ba6: PASS (mock)
- 1793749250988-holdout-05-A-d1a04776: PASS (mock)
- 1793749252141-holdout-06-C-f46d2b07: PASS (mock)
- 1793749253355-holdout-06-A-fd817dbe: PASS (mock)
- 1793749254689-holdout-06-B-122bdc90: PASS (mock)
- 1793749257160-holdout-07-A-f687575d: PASS (mock)
- 1793749258423-holdout-07-B-26328a63: PASS (mock)
- 1793749260804-holdout-07-C-4274b821: PASS (mock)
- 1793749262047-holdout-08-B-6d16bd14: PASS (mock)
- 1793749264752-holdout-08-C-7affd4f9: PASS (mock)
- 1793749266176-holdout-08-A-68370d75: PASS (mock)
- 1793749267420-holdout-09-C-db77e529: PASS (mock)
- 1793749268761-holdout-09-A-fe4d4daf: PASS (mock)
- 1793749269975-holdout-09-B-ce575264: PASS (mock)
- 1793749272538-holdout-10-A-7d3ceccf: PASS (mock)
- 1793749273730-holdout-10-B-71deb5e1: PASS (mock)
- 1793749276103-holdout-10-C-cbd81334: PASS (mock)
- 1793749277293-holdout-11-B-4ab19ced: PASS (mock)
- 1793749279660-holdout-11-C-2a70178f: PASS (mock)
- 1793749280865-holdout-11-A-bd37cdbf: PASS (mock)

## Holdout durdurma kaydı

Kullanıcı 20 holdout’a geçilmemesini istedi. 33 tamamlanmış MOCK holdout koşumu ve 1 yarım koşum var. Gerçek holdout inference çağrısı yapılmadı. Yarım koşum başarı/başarısızlık test oranına katılmadı.
- 1793749282050-holdout-12-C-2a79b0c2: INTERRUPTED_BY_USER; test sonucu bilinmiyor.
