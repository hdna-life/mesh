# M0.2 — Contract-First Execution

Yeni deney sürümü; M0 ve M0.1 değişmez. Yeni sonuçlar workspace içindeki `reports/m0_2/` klasörüne yazılır. Docker, yeni LLM veya yeni Python ortamı yoktur.

## Komutlar

```sh
cd /Users/berdincozer/Desktop/mesh/micro-swarm/m02
npm test
npm run regression
npm run freeze   # yalnızca yeni, henüz dondurulmamış sürümde
npm run run      # A/A2/B/C birer kez; aynı sürümde ikinci gerçek comparison engellenir
```

Node 24+, üst projedeki `.venv` (requirements.lock.txt) ve `.env` gerekir. Secret dosyası kopyalanmaz, loglanmaz. Provider ve deterministik Markdown çıkarıcı M0.1'in dondurulmuş yardımcılarından kullanılır. Onların hash'leri de M0.2 manifestine dahildir. macOS Seatbelt başarısızsa hostta güvenilmeyen kod çalıştırma fallback'i yoktur. Normal terminal dışında Codex sandbox'ından iç sandbox çalıştırmak için araç izni gerekebilir.

## Motor

Contract Engine bütün kollarda input schema, artifact owner, dependency precondition, persisted execution ledger ve candidate kabul/ret yönetir. Motor backend kodu veya SQL üretmez. `contract.json` insan tarafından belirlenen endpoint/DB/interface gereksinimlerini içerir. `config.json` semantik kaynakların kökenini kaydeder.

A/A2 tek sahibin app.py dosyasıdır. B/C'de schema.sql (schema_expert), validation.py (validation_expert), app.py (api_expert) vardır. Repair, dosyanın mevcut sahibine yeni sınırlı görevdir. Genel repair uzmanı başka sahibin dosyasını değiştiremez. Artifact kabul edilmeden AST/SQLite ve uygun sandbox davranış/kabul testleri yürür. Bozuk aday eski kabul edilmiş artifact'ı değiştiremez. Runtime source dosyalarına yazma ayrıca engellenir.

Ledger tekrar açıldığında doğrulanıp yüklenir. Completed aynı input tekrar apply edilmez; explicit invalidation/retry gerekir. Her rejected/accepted attempt ve hash ayrı korunur. SQL'in iki kez güvenle uygulanması ayrı bir SQLite testidir; ledger dedup bunu kanıtlamaz.

B sabit schema → validation → API sırası ve mevcut aşamaya yerel repair kullanır. C graph'ta runnable capability seçer, başarısız artifact owner'ına graph repair node'u ekler; tamamlanan task invalidation'ı bağımlılara yayılır. Dinamik keşif yalnızca üç allowlisted capability ve sınırlı repair node'ları kapsamındadır; açık uçlu semantik planner yoktur. B/C aynı sıraya çıkabilir; graph varlığı performans kanıtı değildir.

## Doğrulama ve sınırlar

10 birim testi persistent dedup/ownership/cycle/dependencies, SQL duplicate vs second-apply ve method/route hatalarını denetler. 7 regression testi önceki golden reference, aynı dört bozuk uygulama ve yeni validation module checker's doğru/bozuk kalibrasyonunu kapsar. Referans kodları yalnızca testlerde bulunur; model promptlarında hazır çözüm yoktur.

Önceki kabul suite'inin assertion bölümü byte-for-byte korunur. Kaynak taşıma (validation.py), immutable source policy ve bağımsız module probe dışındaki test koşulları değiştirilmez. İlk zorunlu setup başarısızsa sonraki bağımlı testler erişilemez; bunlar geçilmiş sayılmaz. Tüm sözleşme + tam acceptance suite geçmeden başarı yoktur.

Statik route analizi yaygın Flask route/get/post/add_url_rule biçimlerini destekler; keyfi metaprogramlama çözülmez. Gerçek HTTP testleri ikinci zorunlu katmandır. Statik field kelimeleri correctness sayılmaz; alanlar gerçek request/response testleriyle doğrulanır. Monolith dinamik DDL'i statik çözülemiyorsa unknown kaydedilir; actual DB ve restart kontrolleri yine gerekir. SQL checker yalnızca DDL'e izin veren authorizer kullanır; uygulama kaynak kodu hostta import edilmez. Genel saldırgan sandbox hizmeti iddia edilmez; önceki macOS profil sınırları korunur.

## Bütçe ve kayıtlar

Her kol en fazla 5 çağrı, 12288 output ve 96000 toplam token upper ceiling. A tek çağrı/repair yok; A2/B/C global iki repair. Varsayılan Cloudflare 1B modeli değişmez. Ortak günlük ledger önceki deneyleri içerir; M0.2 tavanı 5000 Neuron, Workers Free doğrulaması zorunlu; paid moda geçilmez. Gerçek kullanım ayrıca raporlanır; tavan eşitliği gerçek harcamanın eşitliği değildir.

`runs/` her prompt/ham cevap, staging source, validated/rejected attempt, stdout/stderr, execution-ledger.jsonl, contract-state.json ve summary.json dosyasını korur. `frozen.json` yeni kod/config/test/sözleşmeleri ve scientific protokolü hash'ler. `reports/m0_2/root-cause.md`, `protocol.md`, `validation-results.json`, `comparison.json`, `findings.md` deney raporlarıdır. M0/M0.1 değişmezliği ayrıca önce-sonra hash ile kontrol edilir.

Tek görev başarısı veya graph node'u koordinasyon tezini kanıtlamaz. Başarısızlıklar silinmez; sonuçlara göre aynı sürümün parser/prompt/testleri değiştirilmez. Yeni sorunlar bir sonraki deney sürümüne aittir.
