# M1 — Jev Decision Mesh

**Gerçek sonuç: ayrı dondurulan bounded graph uzlaştırması sonrasında backend 41/41 mevcut kabul kontrolünü geçti.**

İlk tek-geçiş M1 sonucu başarısızdır: 124 typed-valid kararda bir idempotency/unique çelişkisi nedeniyle compile edilmedi. Bu negatif kayıt korunur. Ayrı M1-r1 protokolüyle Jev bir ek karar verip çelişkiyi çözdü; compiler veya testler değiştirilmedi.

- **125** Jev semantik karar olayı; **124 aktif** karar, bir superseded karar.
- **1** çelişki, **1** Jev uzlaştırma kararı, kalan çelişki **0**.
- **41/41** gerçek HTTP/SQLite/input/transaction/concurrency/restart kontrolü.
- Smoke dahil **11 Decisions API request**, bildirilen toplam **$0.00138936**; cap **$0.05**.
- Gerçek sürüm: `typesafe/jev-1.14-20261014`. Chat Completions veya kod üreten worker çağrısı yok.

[Sonuçların ayrıntısı](SUMMARY.md) · [Makine özeti](SUMMARY.json) · [Tam kanıt arşivi](results/M1-evidence.zip)

## Üretilen backend'i başlat

Node tarafında npm bağımlılığı yoktur. Önceki deneylerin Python ortamı/Flask sürümü kullanılır.

```sh
cd /Users/berdincozer/Desktop/mesh/micro-swarm/m1
PORT=8787 DATABASE_PATH=/private/tmp/mesh-m1-demo.sqlite ../.venv/bin/python artifacts/application/app.py
```

Başka terminalde:

```sh
curl -s http://127.0.0.1:8787/products
curl -s -X POST http://127.0.0.1:8787/products -H 'Content-Type: application/json' -d '{"sku":"DEMO","name":"Demo item","stock":5}'
```

`artifacts/application/app.py`, gerçekten test edilen dosyanın aynı byte kopyasıdır; elle düzeltilmedi. API key backend için gerekmez. `ir.json` ve `verification.json` aynı klasörde; son graph `artifacts/decision-graph.json` içindedir.

## Deterministik kontroller

```sh
npm test
npm run integration
node --test reconciliation/policy.test.ts
```

Ana 15 unit testi; Jev'siz tam-IR integration kontrolünde 41 kabul kontrolü; ayrıca 4 genel uzlaştırma policy testi vardır. Integration macOS Seatbelt kullanır, Docker yoktur. Codex dış sandbox'ından çalıştırırken araç izni gerekebilir.

## Gerçek inference komutları ve dondurma

Üst projenin `micro-swarm/.env` dosyasında `OPENROUTER_API_KEY` gerekir. Secret loglanmaz veya kopyalanmaz. Provider yalnızca `POST https://openrouter.ai/api/alpha/decisions`, `state/questions/type/instructions/criteria` kullanır. Choice dağılımları, noul değerleri, returned revision, latency ve usage.cost saklanır.

```sh
npm run smoke
npm run freeze
npm run run
node reconciliation/run.ts freeze
node reconciliation/run.ts run
```

Bu sürümde bu adımlar zaten koşuldu: mevcut frozen/result dosyaları ikinci bir deneme seçilmesini engeller. Yeni çalışma yeni deney sürümüyle yapılmalıdır. Ana kaynak/test/input sözleşmesi `frozen.json`; bounded uzlaştırma ayrı `reconciliation/frozen.json` ve PROTOCOL ile sabittir. Orijinal ilk RESULTS.json başarısız sonucu taşır; birleşik sonuç SUMMARY.json içindedir. Budget ledger silinip harcama sıfırlanmaz.

## Katkı ve sınırlar

Entity/Field/Relationship/Constraint/Operation/Transaction/HTTP rolleri aynı Jev modelinin farklı typed sorularıdır. Fiziksel ayrı uzmanlar veya modelin parametre sayısı doğrulanmış değildir. Candidate isimler açık eski gereksinim sözlüğünden, state/literal seçenekleri açık public contract'tan gelir; golden source okunmaz. Bu, açık uçlu gereksinim keşfi değil, kapalı grammar içinde semantik seçimdir.

Compiler/runtime/adapter deney altyapısı Codex tarafından bu koşumdan önce yazıldı; çalıştırılan worker pipeline'ında generatif kod modeli yoktur. Böylece “hiçbir kodlama LLM'i altyapı geliştirmede kullanılmadı” iddiası yapılmaz. Compiler genel SQL/validation/idempotency/transaction/state-transition mekaniklerini hazır sağlar; Jev bunların typed bağlam ve değerlerini seçer. Compiler task-specific entity/endpoint dalları içermez; fakat genel software engineering dili değildir.

Model olmayan kontrol IR'si de aynı compiler ile 41/41 geçer. Bu başarı Jev'in zorunlu olduğunu göstermez. Gerçek production adapter control-ir.json dosyasını okumaz ve eksik kararı ondan tamamlamaz. Empty graph ve zayıf first-choice policy kontrolü geçerli IR üretmez. Tek görevdeki pozitif gözlem geniş tez veya genel zekâ kanıtı değildir.

Bütün ham API kararları, önceki çelişki, yeni Jev kararı, compiler kaynak/çıktıları ve test logları `results/M1-evidence.zip` içinde korunur. Canlı `runs/`, secret ve budget ledger Git'e alınmaz. M0–M0.2 dosyaları değişmeden kalır.
