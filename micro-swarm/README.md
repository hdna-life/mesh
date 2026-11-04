# MICRO-SWARM

**M0 — Can Small Models Cooperate?**

Bu bir araştırma düzeneğidir. Aynı Cloudflare Llama 3.2 1B modelinin tek parça çözümü (A), bütçesi eşit yeniden denemesi (A2), sabit rol sırası (B) ve deterministik bağımlılık grafiğiyle yürütülmesi (C) karşılaştırılır. Merkezi LLM planner yoktur. Roller fine-tune edilmiş ayrı uzmanlar değildir.

İlk gerçek görev: **SQLite kullanan stok ve rezervasyon REST API’si**. Ürün/rezervasyon ilişkisi, atomik stok düşümü, son stok için eşzamanlı yarış, idempotent istekler/iptal ve süreç yeniden başladıktan sonra veri kalıcılığı ölçülür. Kullanıcı bu görevi başlangıçtaki Task API yerine seçmiştir. HTML veya görsel değerlendirme yoktur.

## Kurulum

Node.js 24+, Python 3.9+ ve macOS `sandbox-exec` gerekir. Docker kullanılmaz. Node tarafında npm bağımlılığı yoktur.

```sh
cd /Users/berdincozer/Desktop/mesh/micro-swarm
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env  # Yalnızca .env henüz yoksa
npm test
npm run test:runner
npm run smoke
```

Codex’in dış sandbox’ı içinde çalıştırırken iç macOS sandbox’ının uygulanması için komutun araç izni gerekebilir. Normal macOS terminalinde `sandbox-exec` uygulanabilmelidir. Sandbox kalibrasyonu başarısızsa model kodu çalıştırılmaz; sonuç `sandbox_unavailable` olur. Başka platformda güvenli executor eklenene kadar gerçek kod çalıştırılmaz.

`test:runner` doğru referansı geçirir ve stok düşümü, tekrarlı iptal, restart veri kaybı ve boolean miktar hatası içeren dört mutantı reddeder. Altın referans yalnızca test altyapısıdır; gerçek provider veya promptlara hiçbir hazır backend kodu eklenmez.

## Cloudflare

`.env` içine `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` ve **yalnızca hesap Workers Free ise** `CLOUDFLARE_WORKERS_FREE=true` yazın. Secret’ları paylaşmayın. `.env`, ledger ve `runs/` gitignore içindedir. Worker deploy edilmez; CLI doğrudan REST API kullanır.

```sh
npm run smoke:provider
MAX_BATCH_CALLS=16 npm run run-scenario -- --provider cloudflare --scenario dev-inventory --arms A,A2,B,C
```

Tüm kollarda aynı görev/sözleşme, seed=42, temperature=0; run başına en fazla 6 istek, toplam 8192 çıktı token rezervasyonu ve 48000 toplam token üst sınırı bulunur. Giriş üst sınırı UTF-8 byte sayısı +256 ile muhafazakâr hesaplanır. A tek çağrıda 8192; A2 en fazla 4 ×2048; B/C schema=1024, API=3072, validation=2048, repair=1024 alır. C en fazla iki onarım yapar; başarısız format yeniden denemeleri de aynı bütçeyi tüketir. B sabit dört rolü, onarım gerekmese de çağırır. Eşit olan **bütçe tavanıdır**, gerçek tüketim veya başarıya kadar harcanan miktar değildir; ikisi de raporlanır.

Varsayılan batch sınırı 12 istek ve yerel UTC günlük sınır 1000 Neuron rezervasyonudur. Her HTTP isteğinden önce input üst sınırı ve max_output üzerinden tüketim diske kilitle yazılır; transport hatasında rezervasyon iade edilmez. Fiyat katsayıları 4 Kasım 2026 resmi dokümanından alınmıştır. Başka uygulamaların hesap tüketimi bu ledger’da görülmez. **Ücretsiz plan doğrulaması kullanıcı beyanıdır**; API ile billing planı okunmaz, kalan hesap kotası ölçülmez. Ücretli moda geçiş veya paid plan desteği yoktur. Kota/provider hatası batch’i durdurur, model/provider otomatik değiştirilmez.

Resmi kaynaklar: [model ve REST örneği](https://developers.cloudflare.com/workers-ai/models/llama-3.2-1b-instruct/), [fiyat ve ücretsiz kota](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Benchmark ve protokol

`benchmarks/frozen.json`, görevler, gizli kabul runner’ı, fixture ve TypeScript kodunun SHA-256 değerlerini içerir. Koşum öncesi doğrulanır. Dosyalardan biri değişirse deney durur. `npm run freeze` yalnızca henüz dondurulmamış yeni deney sürümünde kullanılır; mevcut protokolün üzerine yazmaz. Gerçek çıktılardan önceki geliştirme snapshot’ları `docs/` içinde korunmuştur.

```sh
npm run benchmark                              # 20 holdout × A/B/C, MOCK
npm run benchmark -- --provider cloudflare --limit 1 --arms A,A2,B,C
# Tam gerçek benchmark ancak önceden belirlenmiş ve yeterli ücretsiz kota bütçesiyle:
MAX_BATCH_CALLS=120 npm run benchmark -- --provider cloudflare
npm run replay -- --from runs/RUN_ID
```

Tam benchmark yüksek çağrı sayısı gerektirir; varsayılan ücretsiz yerel sınırda tamamlanacağı garanti edilmez. Limit dolunca kısmi sonuç saklanır. Holdout kümesi aynı stok/rezervasyon ailesindeki 20 parametrik varyasyondur (isim/miktar/stok sınırları, sıralama ve rezervasyon filtresi). **20 farklı yazılım alanında genelleme testi değildir.** Development görevi 20 holdout hesabına dahil edilmez. Test kaynakları modele gönderilmez; model yalnızca herkese açık sözleşmeyi ve onarım için test tanılarını görür. Gerçek sonuçlardan sonra görev/test değiştirilmez; değişiklik yeni deney sürümüdür.

## Çıktılar ve karar

Her run `runs/<run_id>/` içinde başlangıç şartları/protokol hash’i, tüm prompt ve ham cevaplar, graph/state, her üretim adımının snapshot’ı, son dosyalar, test tanıları, stdout/stderr ve varsa doğrulanan SQLite dosyasını bırakır. JSONL trace’te parse/schema/provider/budget/graph/runtime/test hataları ayrı kaydedilir. Token kullanımı API döndürmezse bilinmiyor yazılır. Seed ve model ID kaydedilir; provider ağırlık revizyonunu sabitlemediğinden bit düzeyinde yeniden üretim iddia edilmez. Replay kaydedilen yanıtları tekrar yürütür; yeni inference ve yeni model başarısı değildir.

`RESULTS.md` tüm gerçek koşumları; `MOCK_RESULTS.md` altyapı koşumlarını biriktirir. Başarısızlıklar da rapordadır. Şu kurallar bağlayıcıdır:

- M0 deneyi tamamlandı ile tez desteklendi ayrı kararlardır.
- Mock/replay/altın referans sonuçları model başarısı değildir.
- K1: C en az 4/20. K2: C başarı oranı A’nın en az iki katı. A=0 ise oran tanımsızdır; sonsuz kazanç iddiası yapılmaz.
- C/B farkı dinamik kontrol için; A2 ise hata geri beslemesi ve onarım hakkı için gerekli kontroldür.
- 20 senaryoda olumlu sonuç bile kesin kanıt değildir; daha geniş görülmemiş görevler gerekir.
- Sonucu iyileştirmek için başarısız koşum silinmez, test/eşik gevşetilmez, güçlü modele geçilip aynı deney başarılı ilan edilmez.

İzolasyonun ve deneyin sınırları [LIMITATIONS.md](docs/LIMITATIONS.md), karar kuralları [MILESTONES.md](docs/MILESTONES.md) içindedir. Sonraki adım sonuçlara göre belirlenir; model/prompt düzeltmesi gerekiyorsa mevcut başarısızlık korunarak yeni deney sürümü açılır.
